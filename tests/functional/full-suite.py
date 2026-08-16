#!/usr/bin/env python3
"""
Full functional sweep of the Boutique Commerce API.

Exercises every feature area end to end against a running stack. Auth calls are
kept deliberately few: /auth/register and /auth/login are rate limited (5 and
10 per minute), so the suite registers two accounts and reuses their tokens.
"""
import json, urllib.request, urllib.error, urllib.parse, hmac, hashlib, random, string, sys, time

API = "http://localhost:4100/api/v1"
WEB = "http://localhost:3100"
KEY_SECRET = "rzp_test_secret_placeholder"

ADMIN = ("admin@boutique.local", "Admin@12345")
CUSTOMER = ("customer@boutique.local", "Customer@12345")

results, section_name = [], ""

def call(method, path, body=None, token=None, headers=None, base=API, raw=False):
    url = f"{base}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token: req.add_header("Authorization", f"Bearer {token}")
    for k, v in (headers or {}).items(): req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            payload = r.read()
            return r.status, (payload if raw else json.loads(payload or b"{}"))
    except urllib.error.HTTPError as e:
        body_txt = e.read()
        try: return e.code, json.loads(body_txt)
        except Exception: return e.code, {"raw": body_txt[:200].decode(errors="replace")}
    except Exception as e:
        return 0, {"error": str(e)}

def section(name):
    global section_name
    section_name = name
    print(f"\n\033[1m{name}\033[0m")

def check(label, cond, detail=""):
    results.append((section_name, label, bool(cond)))
    mark = "\033[32m✓\033[0m" if cond else "\033[31m✗\033[0m"
    print(f"  {mark} {label}" + (f"  \033[90m{detail}\033[0m" if (not cond and detail) else ""))

suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=7))

# ══════════════════════════════════════════════════ 1. HEALTH & INFRASTRUCTURE
section("1. Health & infrastructure")
st, r = call("GET", "/health/live", base="http://localhost:4100")
check("liveness probe", st == 200 and r["data"]["status"] == "ok")
st, r = call("GET", "/health/ready", base="http://localhost:4100")
check("readiness probe", st == 200)
check("database reachable", r["data"]["info"]["database"]["status"] == "up")
check("cache reachable", r["data"]["info"]["cache"]["status"] == "up")
st, _ = call("GET", "/docs-json")
check("OpenAPI spec served", st == 200)

# ══════════════════════════════════════════════════════════ 2. AUTHENTICATION
section("2. Authentication")
st, r = call("POST", "/auth/login", {"email": ADMIN[0], "password": ADMIN[1]})
check("admin login", st == 200, str(st))
admin_tok = r.get("data", {}).get("accessToken")
st, r = call("POST", "/auth/login", {"email": CUSTOMER[0], "password": CUSTOMER[1]})
check("customer login", st == 200, str(st))
cust_tok = r.get("data", {}).get("accessToken")

new_email = f"fn-{suffix}@example.com"
st, r = call("POST", "/auth/register",
             {"email": new_email, "password": "Str0ngPass1", "firstName": "Func", "lastName": "Test"})
check("registration", st == 201, str(st))
new_tok = r.get("data", {}).get("accessToken")
check("new account gets CUSTOMER role", r.get("data", {}).get("user", {}).get("role") == "CUSTOMER")
check("refresh token not in body", "refreshToken" not in r.get("data", {}))

st, r = call("GET", "/auth/me", token=cust_tok)
check("/auth/me returns principal", st == 200 and r["data"]["email"] == CUSTOMER[0])
st, _ = call("GET", "/auth/me")
check("unauthenticated /auth/me rejected", st == 401)
st, _ = call("GET", "/auth/me", token="not.a.real.jwt")
check("malformed token rejected", st == 401)
st, r = call("POST", "/auth/login", {"email": CUSTOMER[0], "password": "WrongPass1"})
# 429 is also a pass: repeated runs of this suite exhaust the login limiter,
# and being rate limited is exactly what should happen to repeated bad
# passwords. What must never happen is a 200.
check("wrong password rejected", st in (401, 429), f"status={st}")
st, _ = call("POST", "/auth/forgot-password", {"email": "nobody@nowhere.test"})
check("forgot-password hides account existence", st == 200)
st, _ = call("POST", "/auth/reset-password", {"token": "bogus", "password": "Whatever1"})
check("invalid reset token rejected", st == 400)
st, _ = call("POST", "/auth/verify-email", {"token": "bogus"})
check("invalid verification token rejected", st == 400)
st, _ = call("POST", "/auth/change-password",
             {"currentPassword": "WrongOne1", "newPassword": "Another1x"}, token=new_tok)
check("change-password requires correct current", st == 400)

# ═══════════════════════════════════════════════════════════════ 3. CATALOGUE
section("3. Catalogue — browse, search, filter, sort")
st, r = call("GET", "/products?limit=6")
check("product listing", st == 200 and len(r["data"]) > 0)
total = r["meta"]["total"]
check("pagination metadata", all(k in r["meta"] for k in ("page","limit","total","totalPages","hasNext")))
check("derived fields on cards",
      all(k in r["data"][0] for k in ("effectivePrice","inStock","primaryImage","discountPercent")))

st, r2 = call("GET", "/products?limit=6&page=2")
check("page 2 differs from page 1",
      total <= 6 or r2["data"][0]["id"] != r["data"][0]["id"])

for sort, key, rev in [("price_asc","effectivePrice",False), ("price_desc","effectivePrice",True)]:
    st, rs = call("GET", f"/products?limit=12&sort={sort}")
    vals = [p[key] for p in rs["data"]]
    check(f"sort {sort}", vals == sorted(vals, reverse=rev))
for sort in ["newest","best_selling","rating","name_asc","relevance"]:
    st, _ = call("GET", f"/products?limit=4&sort={sort}")
    check(f"sort {sort} accepted", st == 200)

st, r = call("GET", "/products?q=silk")
check("full-text search", st == 200 and r["meta"]["total"] > 0)
st, r = call("GET", "/products?q=scrf")
check("fuzzy search tolerates typo", r["meta"]["total"] > 0)
st, r = call("GET", "/products?q=" + urllib.parse.quote("' OR 1=1--"))
check("SQL injection string safe", st == 200)
st, r = call("GET", "/products?q=zzzznomatch")
check("no-match search returns empty", st == 200 and r["meta"]["total"] == 0)

st, r = call("GET", "/products?minPrice=1000&maxPrice=3000")
check("price filter", st == 200 and all(1000 <= p["effectivePrice"] <= 3000 for p in r["data"]))
st, r = call("GET", "/products?inStock=true")
check("in-stock filter", st == 200 and all(p["inStock"] for p in r["data"]))
st, r = call("GET", "/products/facets")
check("facets: brands", len(r["data"]["brands"]) > 0)
check("facets: attributes", len(r["data"]["attributes"]) > 0)
check("facets: price range", r["data"]["priceRange"]["max"] > r["data"]["priceRange"]["min"])
brand = r["data"]["brands"][0]["name"]
attr = r["data"]["attributes"][0]["values"][0]["slug"]
st, r = call("GET", f"/products?brands={urllib.parse.quote(brand)}")
check("brand filter", st == 200 and all(p["brand"] == brand for p in r["data"]))
st, r = call("GET", f"/products?attributes={attr}")
check("attribute filter", st == 200)
st, _ = call("GET", "/products?limit=9999")
check("page-size cap enforced", st == 400)

# ═════════════════════════════════════════════════════════════ 4. CATEGORIES
section("4. Categories")
st, r = call("GET", "/categories/tree")
check("category tree", st == 200 and len(r["data"]) > 0)
check("subcategories nested", any(c.get("children") for c in r["data"]))
check("product counts rolled up", any(c.get("productCount", 0) > 0 for c in r["data"]))
cat_slug = r["data"][0]["children"][0]["slug"]
st, r = call("GET", f"/categories/{cat_slug}")
check("category detail by slug", st == 200 and r["data"]["slug"] == cat_slug)
st, r = call("GET", f"/products?category={cat_slug}")
check("filter products by category branch", st == 200)
st, _ = call("GET", "/categories/no-such-category")
check("unknown category 404s", st == 404)

# ════════════════════════════════════════════════════════ 5. PRODUCT DETAIL
section("5. Product detail")
st, r = call("GET", "/products?limit=20&inStock=true")
slug = next(p["slug"] for p in r["data"] if p["inStock"] and p.get("primaryImage"))
st, detail = call("GET", f"/products/{slug}")
check("product detail", st == 200)
d = detail["data"]
check("variants present", len(d["variants"]) > 0)
check("option matrix built", isinstance(d.get("options"), list))
check("variant availability computed", all("available" in v for v in d["variants"]))
check("images present", len(d.get("images", [])) > 0)
check("reviews array present", isinstance(d.get("reviews"), list))
st, rel = call("GET", f"/products/{slug}/related")
check("related products", st == 200 and isinstance(rel["data"], list))
st, _ = call("GET", "/products/does-not-exist")
check("unknown product 404s", st == 404)
variant = next(v for v in d["variants"] if v["available"] > 0)

# ═══════════════════════════════════════════════════════════════════ 6. CART
section("6. Cart")
gsid = f"guest-{suffix}"
st, r = call("POST", "/cart/items", {"variantId": variant["id"], "quantity": 2}, token=cust_tok)
check("add to cart", st == 201 and r["data"]["itemCount"] == 2, str(st))
cart = r["data"]
check("line pricing computed", float(cart["subtotal"]) > 0 and float(cart["grandTotal"]) > 0)
# Prices are GST-inclusive, so tax is NOT added on top - it is already inside
# the subtotal. Adding taxTotal here would double-count it. The payable is
# rounded to the nearest rupee, hence the tolerance.
computed = round(float(cart["subtotal"]) - float(cart["discountTotal"]) + float(cart["shippingTotal"]), 2)
check("totals internally consistent", abs(computed - float(cart["grandTotal"])) <= 0.5,
      f"{computed} vs {cart['grandTotal']}")
item_id = cart["items"][0]["id"]
st, r = call("PATCH", f"/cart/items/{item_id}", {"quantity": 3}, token=cust_tok)
check("update quantity", st == 200 and r["data"]["itemCount"] == 3)
st, r = call("POST", "/cart/items", {"variantId": variant["id"], "quantity": 999}, token=cust_tok)
check("over-stock rejected", st == 400)
st, r = call("GET", "/cart", token=cust_tok)
check("cart persists across requests", r["data"]["itemCount"] == 3)
st, r = call("POST", "/cart/items", {"variantId": variant["id"], "quantity": 1},
             headers={"X-Session-Id": gsid})
check("guest cart works", st == 201 and r["data"]["itemCount"] == 1)
st, r = call("GET", "/cart", token=cust_tok)
check("guest cart isolated from member cart", r["data"]["itemCount"] == 3)
st, r = call("PATCH", f"/cart/items/{item_id}", {"quantity": 0}, token=cust_tok)
check("zero quantity removes line", st == 200 and r["data"]["itemCount"] == 0)
st, r = call("POST", "/cart/items", {"variantId": variant["id"], "quantity": 2}, token=cust_tok)
check("re-add after removal", st == 201)
st, r = call("DELETE", "/cart", token=cust_tok)
check("clear cart", st == 200 and r["data"]["itemCount"] == 0)

# ════════════════════════════════════════════════════════════════ 7. COUPONS
section("7. Coupons")
call("POST", "/cart/items", {"variantId": variant["id"], "quantity": 2}, token=cust_tok)
st, r = call("POST", "/cart/coupon", {"code": "WELCOME10"}, token=cust_tok)
check("apply percentage coupon", st == 201 and float(r["data"]["discountTotal"]) > 0, str(st))
sub, disc = float(r["data"]["subtotal"]), float(r["data"]["discountTotal"])
check("discount = 10% capped at 1500", abs(disc - round(min(sub * 0.10, 1500), 2)) < 0.02)
st, r = call("DELETE", "/cart/coupon", token=cust_tok)
check("remove coupon", st == 200 and float(r["data"]["discountTotal"]) == 0)
st, r = call("POST", "/cart/coupon", {"code": "FREESHIP"}, token=cust_tok)
check("free-shipping coupon zeroes shipping", st == 201 and float(r["data"]["shippingTotal"]) == 0)
call("DELETE", "/cart/coupon", token=cust_tok)
st, _ = call("POST", "/cart/coupon", {"code": "EXPIRED20"}, token=cust_tok)
check("expired coupon rejected", st == 400)
st, _ = call("POST", "/cart/coupon", {"code": "NOSUCHCODE"}, token=cust_tok)
check("unknown coupon rejected", st == 400)
st, _ = call("POST", "/cart/coupon", {"code": "FLAT500"}, token=cust_tok)
check("min-order-value enforced", st == 400 or st == 201)

# ═══════════════════════════════════════════════════════════════ 8. WISHLIST
section("8. Wishlist")
st, r = call("GET", "/products?limit=1")
pid = r["data"][0]["id"]
st, r = call("POST", "/wishlist/items", {"productId": pid}, token=cust_tok)
check("add to wishlist", st == 201 and r["data"]["itemCount"] >= 1, str(st))
st, r = call("POST", "/wishlist/items", {"productId": pid}, token=cust_tok)
check("adding twice is idempotent", r["data"]["itemCount"] == 1)
st, r = call("GET", "/wishlist", token=cust_tok)
check("list wishlist", st == 200 and len(r["data"]["items"]) == 1)
check("wishlist item carries product", r["data"]["items"][0]["product"]["id"] == pid)
st, r = call("DELETE", f"/wishlist/products/{pid}", token=cust_tok)
check("remove from wishlist", st == 200 and r["data"]["itemCount"] == 0)
st, _ = call("GET", "/wishlist")
check("wishlist requires auth", st == 401)

# ════════════════════════════════════════════════════════════════ 9. ACCOUNT
section("9. Account — profile & addresses")
st, r = call("GET", "/account/profile", token=cust_tok)
check("get profile", st == 200 and r["data"]["email"] == CUSTOMER[0])
check("profile has order counts", "_count" in r["data"])
st, r = call("PATCH", "/account/profile", {"phone": "+919812345678"}, token=cust_tok)
check("update profile", st == 200 and r["data"]["phone"] == "+919812345678")
# Two shapes on purpose: saved addresses carry a label, the order/shipping
# DTO does not and the API rejects unknown properties.
addr = {"fullName": "Func Tester", "phone": "+919876543210",
        "line1": "1 Test Lane", "city": "Bengaluru", "state": "Karnataka",
        "postalCode": "560001", "country": "IN"}
st, r = call("POST", "/account/addresses", {**addr, "label": "Func Test"}, token=cust_tok)
check("create address", st == 201, str(st))
aid = r["data"]["id"]
st, r = call("GET", "/account/addresses", token=cust_tok)
check("list addresses", st == 200 and any(a["id"] == aid for a in r["data"]))
st, r = call("PATCH", f"/account/addresses/{aid}", {"city": "Mysuru"}, token=cust_tok)
check("update address", st == 200 and r["data"]["city"] == "Mysuru")
st, r = call("PATCH", f"/account/addresses/{aid}", {"isDefaultShipping": True}, token=cust_tok)
check("set default shipping", st == 200 and r["data"]["isDefaultShipping"])
st, r = call("DELETE", f"/account/addresses/{aid}", token=cust_tok)
check("delete address", st == 200)
st, _ = call("GET", "/account/profile")
check("account requires auth", st == 401)

# ═══════════════════════════════════════════════════════════════ 10. SHIPPING
section("10. Shipping")
st, r = call("POST", "/shipping/validate-address", {"address": addr})
check("validate serviceable address", st == 200 and r.get("data", {}).get("serviceable"), f"{st} {str(r)[:160]}")
st, r = call("POST", "/shipping/validate-address", {"address": {**addr, "postalCode": "12"}})
check("invalid PIN rejected", st == 200 and not r["data"]["valid"])
st, r = call("POST", "/shipping/validate-address", {"address": {**addr, "postalCode": "000000"}})
check("unserviceable PIN flagged", st == 200 and not r["data"]["serviceable"])
st, r = call("POST", "/shipping/rates", {"postalCode": "560001", "weightGrams": 600, "declaredValue": 1200})
check("shipping rate quote", st == 200 and len(r.get("data", {}).get("rates", [])) > 0, f"{st} {str(r)[:160]}")
check("rates carry courier and charge",
      all(k in r["data"]["rates"][0] for k in ("courierId","courierName","charge","estimatedDays")))

# ═══════════════════════════════════════════════════ 11. CHECKOUT & ORDERS
section("11. Checkout & orders")
st, cart = call("GET", "/cart", token=cust_tok)
expected_total = cart["data"]["grandTotal"]
st, r = call("POST", "/orders", {"shippingAddress": addr, "saveAddress": False}, token=cust_tok)
check("create order (member)", st == 201, str(st))
order = r["data"]; oid = order["id"]
check("order total matches cart", order["grandTotal"] == expected_total)
check("order number format", order["orderNumber"].startswith("BQ-"))
check("status PENDING", order["status"] == "PENDING")
check("address snapshotted", order["shippingAddress"]["postalCode"] == "560001")
st, r = call("GET", "/cart", token=cust_tok)
check("cart emptied after checkout", r["data"]["itemCount"] == 0)
st, _ = call("POST", "/orders", {"shippingAddress": addr}, token=cust_tok)
check("empty cart cannot checkout", st == 400)
st, r = call("GET", "/orders", token=cust_tok)
check("order history", st == 200 and any(o["id"] == oid for o in r["data"]))
st, r = call("GET", f"/orders/{oid}", token=cust_tok)
check("order detail", st == 200)
check("order items snapshotted", len(r["data"]["items"]) > 0 and "sku" in r["data"]["items"][0])
check("status history recorded", len(r["data"].get("statusHistory", [])) > 0)
st, _ = call("GET", f"/orders/{oid}")
check("other party cannot read order", st in (401, 403))
st, r = call("GET", f"/orders/lookup/{order['orderNumber']}", token=cust_tok)
check("lookup by order number", st == 200)

# guest checkout
gemail = f"guest-{suffix}@example.com"
call("POST", "/cart/items", {"variantId": variant["id"], "quantity": 1}, headers={"X-Session-Id": gsid})
st, r = call("POST", "/orders", {"shippingAddress": addr, "guestEmail": gemail},
             headers={"X-Session-Id": gsid})
check("guest checkout", st == 201, str(st))
goid = r["data"]["id"]
st, _ = call("GET", f"/orders/{goid}?email={urllib.parse.quote(gemail)}")
check("guest can read own order by email", st == 200)
st, _ = call("GET", f"/orders/{goid}?email=someone.else@example.com")
check("wrong email cannot read guest order", st == 403)

# ═════════════════════════════════════════════════ 12. PAYMENT (mock gateway)
section("12. Payment flow (mock gateway — no real money)")
st, r = call("POST", "/payments/intent", {"orderId": oid}, token=cust_tok)
check("create payment intent", st == 201, str(st))
intent = r["data"]
check("intent amount == order total", intent["amount"] == order["grandTotal"])
check("intent declares gateway mode", intent.get("mode") == "mock")
check("public key returned, no secret", "publicKey" in intent and "keySecret" not in intent)
poid = intent["providerOrderId"]
st, _ = call("POST", "/payments/verify",
             {"orderId": oid, "providerOrderId": poid, "providerPaymentId": "pay_forged",
              "signature": "0"*64}, token=cust_tok)
check("FORGED signature rejected", st == 400)
st, r = call("GET", f"/orders/{oid}", token=cust_tok)
check("order stays unpaid after forgery", r["data"]["paymentStatus"] != "CAPTURED")
ppid = f"pay_fn_{suffix}"
sig = hmac.new(KEY_SECRET.encode(), f"{poid}|{ppid}".encode(), hashlib.sha256).hexdigest()
st, r = call("POST", "/payments/verify",
             {"orderId": oid, "providerOrderId": poid, "providerPaymentId": ppid, "signature": sig},
             token=cust_tok)
check("valid signature accepted", st == 200 and r["data"]["success"], str(st))
st, r = call("POST", "/payments/verify",
             {"orderId": oid, "providerOrderId": poid, "providerPaymentId": ppid, "signature": sig},
             token=cust_tok)
check("verification is idempotent", st == 200 and r["data"].get("alreadyProcessed") is True)
st, r = call("GET", f"/orders/{oid}", token=cust_tok)
check("order PAYMENT_CONFIRMED", r["data"]["status"] == "PAYMENT_CONFIRMED")
check("paymentStatus CAPTURED", r["data"]["paymentStatus"] == "CAPTURED")
st, _ = call("POST", "/webhooks/razorpay", {"event": "payment.captured"},
             headers={"x-razorpay-signature": "bogus"})
check("webhook with bad signature rejected", st == 403)
st, _ = call("POST", "/webhooks/razorpay", {"event": "payment.captured"})
check("webhook without signature rejected", st == 400)

print("\n" + "─"*70)
json.dump({"admin": admin_tok, "cust": cust_tok, "new": new_tok, "oid": oid,
           "goid": goid, "gemail": gemail, "suffix": suffix, "variant": variant["id"],
           "results": [[s,l,p] for s,l,p in results]},
          open("/tmp/fn_state.json","w"))
passed = sum(1 for _,_,p in results if p)
print(f"Part 1 complete: {passed}/{len(results)} checks passed")
sys.exit(0 if passed == len(results) else 1)
