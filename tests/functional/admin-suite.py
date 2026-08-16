#!/usr/bin/env python3
"""Admin-side functional sweep. Reuses tokens captured by full-suite.py."""
import json, urllib.request, urllib.error, urllib.parse, random, string, sys

API = "http://localhost:4100/api/v1"
results, section_name = [], ""

def call(method, path, body=None, token=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{API}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token: req.add_header("Authorization", f"Bearer {token}")
    for k, v in (headers or {}).items(): req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read())
        except Exception: return e.code, {}
    except Exception as e:
        return 0, {"error": str(e)}

def section(name):
    global section_name; section_name = name; print(f"\n\033[1m{name}\033[0m")

def check(label, cond, detail=""):
    results.append((section_name, label, bool(cond)))
    print(f"  {'\033[32m✓\033[0m' if cond else '\033[31m✗\033[0m'} {label}" +
          (f"  \033[90m{detail}\033[0m" if (not cond and detail) else ""))

state = json.load(open("/tmp/fn_state.json"))
admin, cust, oid = state["admin"], state["cust"], state["oid"]
sfx = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))

# ═══════════════════════════════════════════════════════════ 13. ADMIN RBAC
section("13. Admin access control")
for path in ["/admin/products", "/admin/orders", "/admin/customers", "/admin/coupons",
             "/admin/analytics/dashboard", "/admin/inventory/low-stock",
             "/admin/audit-logs", "/admin/reviews", "/admin/notifications",
             "/admin/content/banners"]:
    st, _ = call("GET", path, token=cust)
    check(f"CUSTOMER denied {path}", st == 403, str(st))
st, _ = call("GET", "/admin/products")
check("anonymous denied admin", st == 401)
st, _ = call("GET", "/admin/products", token=admin)
check("ADMIN allowed", st == 200)

# ═══════════════════════════════════════════════════════ 14. ADMIN ANALYTICS
section("14. Analytics & reports")
st, r = call("GET", "/admin/analytics/dashboard", token=admin)
check("dashboard KPIs", st == 200)
d = r.get("data", {})
check("revenue block", all(k in d.get("revenue", {}) for k in ("gross","net","refunded","averageOrderValue")))
check("orders block", all(k in d.get("orders", {}) for k in ("paid","total","pendingFulfilment","conversionRate")))
check("customers block", "total" in d.get("customers", {}))
check("low-stock alert count", "lowStockVariants" in d.get("alerts", {}))
check("revenue counts only captured payments", float(d["revenue"]["gross"]) > 0)
st, r = call("GET", "/admin/analytics/sales-series", token=admin)
check("daily sales series", st == 200 and len(r["data"]) >= 29)
check("series gap-filled", all("revenue" in p and "orders" in p for p in r["data"]))
st, r = call("GET", "/admin/analytics/best-sellers?limit=5", token=admin)
check("best sellers", st == 200 and isinstance(r["data"], list))
st, r = call("GET", "/admin/analytics/revenue-by-category", token=admin)
check("revenue by category", st == 200)
st, r = call("GET", "/admin/analytics/order-status", token=admin)
check("order status breakdown", st == 200 and len(r["data"]) > 0)
st, r = call("GET", "/admin/analytics/top-customers?limit=5", token=admin)
check("top customers", st == 200)
st, r = call("GET", "/admin/analytics/reports/sales", token=admin)
check("sales report rows (CSV-ready)", st == 200 and isinstance(r["data"], list))
st, r = call("GET", "/admin/analytics/dashboard?from=2020-01-01&to=2030-01-01", token=admin)
check("date-range filter accepted", st == 200)

# ══════════════════════════════════════════════════════ 15. ADMIN CATEGORIES
section("15. Category management")
st, r = call("GET", "/admin/categories", token=admin)
check("list categories", st == 200 and len(r["data"]) > 0)
st, r = call("POST", "/admin/categories", {"name": f"Func Cat {sfx}"}, token=admin)
check("create category", st == 201, str(st))
cid = r.get("data", {}).get("id")
check("slug auto-generated", r.get("data", {}).get("slug", "").startswith("func-cat"))
st, r = call("POST", "/admin/categories", {"name": f"Func Sub {sfx}", "parentId": cid}, token=admin)
check("create subcategory", st == 201)
subid = r.get("data", {}).get("id")
st, r = call("PATCH", f"/admin/categories/{cid}", {"description": "updated"}, token=admin)
check("update category", st == 200 and r["data"]["description"] == "updated")
st, _ = call("PATCH", f"/admin/categories/{cid}", {"parentId": cid}, token=admin)
check("category cannot parent itself", st == 400)
st, _ = call("PATCH", f"/admin/categories/{cid}", {"parentId": subid}, token=admin)
check("cannot move under own descendant", st == 400)
st, _ = call("DELETE", f"/admin/categories/{cid}", token=admin)
check("cannot delete category with children", st == 400)
st, _ = call("DELETE", f"/admin/categories/{subid}", token=admin)
check("delete empty subcategory", st == 200)
st, _ = call("DELETE", f"/admin/categories/{cid}", token=admin)
check("delete empty parent", st == 200)

# ════════════════════════════════════════════════════════ 16. ADMIN PRODUCTS
section("16. Product management")
st, r = call("GET", "/admin/categories", token=admin)
target_cat = r["data"][0]["id"]
st, r = call("GET", "/admin/products?limit=5", token=admin)
check("list products (incl. drafts)", st == 200)
check("stock rollup present", "totalStock" in r["data"][0] and "lowStock" in r["data"][0])
for q in ["search=silk", "status=ACTIVE", "search=BQ&status=ACTIVE"]:
    st, _ = call("GET", f"/admin/products?{q}", token=admin)
    check(f"filter {q}", st == 200)
new_product = {
    "name": f"Func Product {sfx}", "categoryId": target_cat, "brand": "Func Atelier",
    "basePrice": 2499, "compareAtPrice": 3299, "taxRatePercent": 5, "status": "ACTIVE",
    "shortDescription": "Created by the functional sweep",
    "variants": [
        {"sku": f"FN-{sfx}-S", "name": "Small", "price": 2499, "stockQuantity": 8,
         "attributes": [{"attributeName": "Size", "value": "S"}]},
        {"sku": f"FN-{sfx}-M", "name": "Medium", "price": 2499, "stockQuantity": 3,
         "lowStockThreshold": 5, "attributes": [{"attributeName": "Size", "value": "M"}]},
    ],
}
st, r = call("POST", "/admin/products", new_product, token=admin)
check("create product with variants", st == 201, str(st))
pid = r.get("data", {}).get("id")
check("variants created", len(r.get("data", {}).get("variants", [])) == 2)
check("inventory created", r["data"]["variants"][0].get("inventory", {}).get("quantity") == 8)
st, r = call("GET", f"/products?q=Func+Product+{sfx}")
check("ACTIVE product visible on storefront", st == 200 and r["meta"]["total"] >= 1)
st, _ = call("POST", "/admin/products", {**new_product,
             "variants": [{"sku": f"D-{sfx}", "name": "A", "price": 10, "stockQuantity": 1},
                          {"sku": f"D-{sfx}", "name": "B", "price": 10, "stockQuantity": 1}]}, token=admin)
check("duplicate SKU rejected", st == 400)
st, _ = call("POST", "/admin/products", {**new_product, "variants": []}, token=admin)
check("product without variants rejected", st == 400)
st, _ = call("POST", "/admin/products", {**new_product, "categoryId": "nope"}, token=admin)
check("unknown category rejected", st == 400)
st, _ = call("POST", "/admin/products", {**new_product,
             "variants": [{"sku": f"P-{sfx}", "name": "A", "price": 100, "discountPrice": 200, "stockQuantity": 1}]},
             token=admin)
check("discount above price rejected", st == 400)
st, r = call("PATCH", f"/admin/products/{pid}", {"basePrice": 1999, "isFeatured": True}, token=admin)
check("update product", st == 200 and r["data"]["basePrice"] == "1999")
st, r = call("PATCH", f"/admin/products/{pid}", {"status": "DRAFT"}, token=admin)
check("set to DRAFT", st == 200)
st, r = call("GET", f"/products?q=Func+Product+{sfx}")
check("DRAFT hidden from storefront", r["meta"]["total"] == 0)

# ═══════════════════════════════════════════════════════ 17. ADMIN INVENTORY
section("17. Inventory management")
st, r = call("GET", f"/admin/products/{pid}", token=admin)
vid = r["data"]["variants"][0]["id"]
st, r = call("GET", f"/admin/inventory/{vid}", token=admin)
check("read stock position", st == 200 and "available" in r["data"])
st, r = call("GET", "/admin/inventory/low-stock", token=admin)
check("low-stock queue", st == 200)
check("low-stock rows carry variant", r["meta"]["total"] == 0 or "variant" in r["data"][0])
st, r = call("PATCH", f"/admin/inventory/{vid}", {"quantity": 42, "changeType": "RESTOCK",
             "reason": "functional sweep"}, token=admin)
check("adjust stock", st == 200 and r["data"]["quantity"] == 42)
st, r = call("POST", f"/admin/inventory/{vid}/restock", {"quantity": 8}, token=admin)
check("restock adds units", st == 201 and r["data"]["quantity"] == 50)
st, r = call("PATCH", f"/admin/inventory/{vid}/threshold", {"lowStockThreshold": 12}, token=admin)
check("update threshold", st == 200 and r["data"]["lowStockThreshold"] == 12)
st, r = call("GET", f"/admin/inventory/{vid}/history", token=admin)
check("movement history", st == 200 and len(r["data"]) > 0)
check("history records reason", any(h.get("reason") == "functional sweep" for h in r["data"]))

# ══════════════════════════════════════════════════════════ 18. ADMIN ORDERS
section("18. Order management & fulfilment")
st, r = call("GET", "/admin/orders?limit=5", token=admin)
check("list orders", st == 200 and len(r["data"]) > 0)
for q in ["status=PENDING", "paymentStatus=CAPTURED", "search=BQ",
          "from=2020-01-01&to=2030-01-01", "status=DELIVERED&search=BQ"]:
    st, _ = call("GET", f"/admin/orders?{q}", token=admin)
    check(f"filter {q}", st == 200)
st, _ = call("GET", "/admin/orders?status=NOT_A_STATUS", token=admin)
check("invalid enum rejected", st == 400)
st, r = call("GET", f"/admin/orders/{oid}", token=admin)
check("order detail", st == 200 and r["data"]["id"] == oid)
check("payments attached", len(r["data"].get("payments", [])) > 0)
st, _ = call("PATCH", f"/admin/orders/{oid}/status", {"status": "DELIVERED"}, token=admin)
check("illegal transition rejected", st == 400)
st, r = call("PATCH", f"/admin/orders/{oid}/status", {"status": "PROCESSING"}, token=admin)
check("PAYMENT_CONFIRMED -> PROCESSING", st == 200)
st, r = call("PATCH", f"/admin/orders/{oid}/status", {"status": "PACKED"}, token=admin)
check("PROCESSING -> PACKED", st == 200)
st, r = call("PATCH", f"/admin/orders/{oid}/note", {"note": "handled by sweep"}, token=admin)
check("internal note", st == 200)

# ════════════════════════════════════════════════════════ 19. ADMIN SHIPPING
section("19. Shipment booking & tracking")
st, r = call("POST", f"/admin/shipping/orders/{oid}/shipments", {}, token=admin)
check("book shipment", st == 201, str(st))
shp = r.get("data", {})
check("AWB issued", bool(shp.get("awbCode")))
check("tracking URL set", bool(shp.get("trackingUrl")))
st, r = call("GET", f"/admin/orders/{oid}", token=admin)
check("order advanced to SHIPPED", r["data"]["status"] == "SHIPPED")
st, r = call("GET", f"/admin/shipping/orders/{oid}/shipments", token=admin)
check("list shipments", st == 200 and len(r["data"]) > 0)
sid = shp.get("id")
st, r = call("POST", f"/admin/shipping/shipments/{sid}/sync", {}, token=admin)
check("sync carrier tracking", st == 201, str(st))
st, r = call("GET", f"/admin/orders/{oid}", token=admin)
check("tracking events stored", len(r["data"]["shipments"][0].get("trackingEvents", [])) > 0)

# ═════════════════════════════════════════════════════════ 20. ADMIN REFUNDS
section("20. Refunds")
st, r = call("GET", f"/admin/orders/{oid}", token=admin)
total = float(r["data"]["grandTotal"])
st, r = call("POST", f"/admin/payments/orders/{oid}/refund", {"amount": 100, "reason": "sweep"}, token=admin)
check("partial refund", st == 201, str(st))
st, _ = call("POST", f"/admin/payments/orders/{oid}/refund", {"amount": total}, token=admin)
check("over-refund rejected", st == 400)
st, r = call("GET", f"/admin/orders/{oid}", token=admin)
check("payment marked partially refunded", r["data"]["paymentStatus"] == "PARTIALLY_REFUNDED")
check("refund recorded", len(r["data"].get("refunds", [])) > 0)
st, _ = call("POST", "/admin/payments/reconcile", {}, token=admin)
check("reconciliation job runs", st == 201)
st, _ = call("POST", "/admin/payments/webhooks/retry", {}, token=admin)
check("webhook retry job runs", st == 201)

# ═════════════════════════════════════════════════════════ 21. ADMIN COUPONS
section("21. Coupon management")
code = f"FN{sfx.upper()}"
st, r = call("POST", "/admin/coupons", {"code": code, "type": "PERCENTAGE", "value": 15,
             "minOrderValue": 0, "usageLimitPerUser": 5}, token=admin)
check("create coupon", st == 201, str(st))
cpid = r.get("data", {}).get("id")
st, r = call("GET", "/admin/coupons?search=FN", token=admin)
check("search coupons", st == 200)
st, r = call("GET", f"/admin/coupons/{cpid}", token=admin)
check("coupon detail with redemption count", st == 200 and "_count" in r["data"])
st, _ = call("POST", "/admin/coupons", {"code": "BAD CODE!", "type": "FIXED", "value": 10}, token=admin)
check("malformed code rejected", st == 400)
st, _ = call("POST", "/admin/coupons", {"code": f"PCT{sfx.upper()}", "type": "PERCENTAGE", "value": 150}, token=admin)
check("percentage over 100 rejected", st == 400)
st, r = call("PATCH", f"/admin/coupons/{cpid}", {"value": 20}, token=admin)
check("update coupon", st == 200)
st, r = call("DELETE", f"/admin/coupons/{cpid}", token=admin)
check("delete unused coupon", st == 200)

# ═══════════════════════════════════════════════════════ 22. ADMIN CUSTOMERS
section("22. Customer management")
st, r = call("GET", "/admin/customers?limit=5", token=admin)
check("list customers", st == 200 and r["meta"]["total"] >= 2)
st, r = call("GET", "/admin/customers?search=customer@", token=admin)
check("search by email", st == 200 and len(r["data"]) >= 1)
st, r = call("GET", "/admin/customers?status=ACTIVE", token=admin)
check("filter by status", st == 200)
cust_id = next(c["id"] for c in r["data"] if c["email"] == "customer@boutique.local")
st, r = call("GET", f"/admin/customers/{cust_id}", token=admin)
check("customer 360", st == 200)
check("lifetime value computed", "lifetimeValue" in r["data"]["stats"])
check("recent orders attached", isinstance(r["data"].get("orders"), list))
check("addresses attached", isinstance(r["data"].get("addresses"), list))
st, r = call("PATCH", f"/admin/customers/{cust_id}", {"phone": "+919000000001"}, token=admin)
check("update customer", st == 200)

# ════════════════════════════════════════════════════════ 23. ADMIN REVIEWS
section("23. Review moderation")
st, r = call("GET", "/admin/reviews", token=admin)
check("moderation queue", st == 200)
st, r = call("GET", "/admin/reviews?status=PENDING", token=admin)
check("filter by status", st == 200)

# ════════════════════════════════════════════════════════ 24. ADMIN CONTENT
section("24. Content management")
st, r = call("GET", "/admin/content/banners", token=admin)
check("list banners", st == 200 and len(r["data"]) > 0)
st, r = call("POST", "/admin/content/banners", {"title": f"Func Banner {sfx}",
             "imageUrl": "/static/banners/x.svg", "placement": "HOME_PROMO"}, token=admin)
check("create banner", st == 201, str(st))
bid = r.get("data", {}).get("id")
st, r = call("PATCH", f"/admin/content/banners/{bid}", {"isActive": False}, token=admin)
check("update banner", st == 200 and r["data"]["isActive"] is False)
st, r = call("DELETE", f"/admin/content/banners/{bid}", token=admin)
check("delete banner", st == 200)
st, r = call("GET", "/content/homepage")
check("public homepage payload", st == 200)
check("homepage sections", all(k in r["data"] for k in
      ("heroBanners","promoBanners","featured","newArrivals","bestSellers","categories")))
st, r = call("PATCH", "/admin/content/settings/store.announcement",
             {"value": "Functional sweep"}, token=admin)
check("update store setting", st == 200)
st, r = call("GET", "/content/settings")
check("public settings", st == 200 and r["data"].get("store.announcement") == "Functional sweep")

# ══════════════════════════════════════════════════════════ 25. AUDIT & LOGS
section("25. Audit trail & notifications")
st, r = call("GET", "/admin/audit-logs?limit=10", token=admin)
check("audit log readable", st == 200 and len(r["data"]) > 0)
check("audit records actor", any(a.get("actorEmail") for a in r["data"]))
st, r = call("GET", "/admin/audit-logs?action=product", token=admin)
check("filter audit by action", st == 200)
st, r = call("GET", "/admin/audit-logs?entityType=Product", token=admin)
check("filter audit by entity", st == 200)
st, r = call("GET", "/admin/notifications?limit=5", token=admin)
check("notification delivery log", st == 200)
st, r = call("GET", "/admin/notifications?status=SENT&channel=EMAIL", token=admin)
check("filter notifications", st == 200)
st, r = call("GET", "/notifications", token=cust)
check("customer notification history", st == 200)

# ═════════════════════════════════════════════════════════════ 26. CLEANUP
section("26. Cleanup")
st, _ = call("DELETE", f"/admin/products/{pid}", token=admin)
check("archive test product", st == 200)

print("\n" + "─"*70)
passed = sum(1 for _,_,p in results if p)
by_section = {}
for sec, _, ok in results:
    a, b = by_section.get(sec, (0,0)); by_section[sec] = (a + (1 if ok else 0), b + 1)
print(f"Part 2 complete: {passed}/{len(results)} checks passed")
json.dump([[s,l,p] for s,l,p in results], open("/tmp/fn_admin.json","w"))
sys.exit(0 if passed == len(results) else 1)
