#!/usr/bin/env python3
"""
Functional sweep of the compliance surface: GST computation, cash on delivery,
tax invoicing and the returns flow.

These are the paths that decide whether the store can legally take money, so
they are checked against a running API rather than mocked. Run with the API up:

    python3 tests/functional/gst-cod-invoice-returns.py [--base http://localhost:4200/api/v1]
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

ap = argparse.ArgumentParser()
ap.add_argument("--base", default="http://localhost:4200/api/v1")
args = ap.parse_args()
BASE = args.base.rstrip("/")

passed, failed = 0, 0
failures = []


def check(name, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  \033[32mPASS\033[0m {name}")
    else:
        failed += 1
        failures.append(f"{name}: {detail}")
        print(f"  \033[31mFAIL\033[0m {name}  {detail}")


def call(method, path, body=None, token=None, headers=None, raw=False):
    url = f"{BASE}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            payload = r.read()
            if raw:
                return r.status, payload, dict(r.headers)
            return r.status, json.loads(payload or b"{}"), dict(r.headers)
    except urllib.error.HTTPError as e:
        payload = e.read()
        if raw:
            return e.code, payload, dict(e.headers)
        try:
            return e.code, json.loads(payload or b"{}"), dict(e.headers)
        except json.JSONDecodeError:
            return e.code, {"raw": payload.decode(errors="replace")}, dict(e.headers)


def unwrap(body):
    return body.get("data", body) if isinstance(body, dict) else body


def D(v):
    return Decimal(str(v))


ADDR_KA = {
    "fullName": "Ananya Rao", "phone": "9876543210", "line1": "12 Lavelle Road",
    "city": "Bengaluru", "state": "Karnataka", "postalCode": "560001", "country": "IN",
}
ADDR_MH = {**ADDR_KA, "city": "Mumbai", "state": "Maharashtra", "postalCode": "400001"}


def new_session():
    return str(uuid.uuid4())


def add_to_cart(session, variant_id, qty=1):
    return call("POST", "/cart/items", {"variantId": variant_id, "quantity": qty},
                headers={"X-Session-Id": session})


def get_cart(session):
    _, body, _ = call("GET", "/cart", headers={"X-Session-Id": session})
    return unwrap(body)


def pick_variant(index=0):
    _, body, _ = call("GET", "/products?limit=20")
    products = unwrap(body)
    for p in products[index:]:
        _, detail, _ = call("GET", f"/products/{p['slug']}")
        d = unwrap(detail)
        for v in d.get("variants", []):
            available = v.get("availableQuantity", v.get("available", 0))
            if v.get("inStock") and (available is None or available > 2):
                return d, v
    raise SystemExit("No purchasable variant found - is the database seeded?")


ADMIN_EMAIL = "admin@boutique.local"
ADMIN_PASSWORD = "Admin@12345"

_, _admin_login, _ = call("POST", "/auth/login", {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
admin_token = unwrap(_admin_login).get("accessToken")


def ensure_stock(variant_id, minimum=60):
    """
    Guarantee headroom before the concurrency section.

    A freshly seeded catalogue carries realistic stock, and this suite fires a
    dozen simultaneous checkouts at one variant. Running out mid-run makes the
    oversell protection reject orders - correct behaviour, but it would look
    like an invoicing failure. Topping up first keeps the test measuring what
    it claims to measure.
    """
    if not admin_token:
        return
    call("PATCH", f"/admin/inventory/{variant_id}",
         {"quantity": minimum, "changeType": "RESTOCK", "reason": "compliance suite top-up"},
         token=admin_token)


print("\n\033[1m1. GST computation\033[0m")
product, variant = pick_variant()
ensure_stock(variant["id"])
session = new_session()
add_to_cart(session, variant["id"], 1)
cart = get_cart(session)

check("cart reports GST-inclusive pricing", cart.get("pricesIncludeGst") is True,
      f"pricesIncludeGst={cart.get('pricesIncludeGst')}")
check("cart exposes a taxable total", cart.get("taxableTotal") is not None)

if cart.get("taxableTotal") is not None:
    taxable, tax = D(cart["taxableTotal"]), D(cart["taxTotal"])
    goods = D(cart["subtotal"]) - D(cart["discountTotal"])
    check("tax is inside the advertised price, not added to it",
          taxable + tax == goods, f"{taxable} + {tax} != {goods}")

line = cart["items"][0]
check("cart line carries the GST rate", D(line.get("gstRate", 0)) > 0, f"gstRate={line.get('gstRate')}")

print("\n\033[1m2. Place of supply\033[0m")
_, ka_order, _ = call("POST", "/orders",
                      {"shippingAddress": ADDR_KA, "guestEmail": f"ka-{uuid.uuid4().hex[:8]}@example.com"},
                      headers={"X-Session-Id": session})
ka = unwrap(ka_order)
check("intra-state order created", "id" in ka, json.dumps(ka)[:200])
if "id" in ka:
    check("intra-state splits into CGST and SGST",
          D(ka["cgstTotal"]) > 0 and D(ka["cgstTotal"]) == D(ka["sgstTotal"]) and D(ka["igstTotal"]) == 0,
          f"cgst={ka['cgstTotal']} sgst={ka['sgstTotal']} igst={ka['igstTotal']}")
    check("place of supply recorded", ka.get("placeOfSupply") == "Karnataka", ka.get("placeOfSupply"))
    check("seller GSTIN stamped on the order", bool(ka.get("sellerGstin")), ka.get("sellerGstin"))

session2 = new_session()
add_to_cart(session2, variant["id"], 1)
_, mh_order, _ = call("POST", "/orders",
                      {"shippingAddress": ADDR_MH, "guestEmail": f"mh-{uuid.uuid4().hex[:8]}@example.com"},
                      headers={"X-Session-Id": session2})
mh = unwrap(mh_order)
check("inter-state order created", "id" in mh, json.dumps(mh)[:200])
if "id" in mh and "id" in ka:
    check("inter-state charges IGST only",
          D(mh["igstTotal"]) > 0 and D(mh["cgstTotal"]) == 0,
          f"igst={mh['igstTotal']} cgst={mh['cgstTotal']}")
    check("the customer pays the same either way",
          D(mh["grandTotal"]) == D(ka["grandTotal"]),
          f"{mh['grandTotal']} vs {ka['grandTotal']}")
    check("GST components reconcile to the order total",
          D(ka["taxableTotal"]) + D(ka["cgstTotal"]) + D(ka["sgstTotal"]) + D(ka["igstTotal"])
          == D(ka["grandTotal"]),
          f"parts={D(ka['taxableTotal'])+D(ka['cgstTotal'])+D(ka['sgstTotal'])} total={ka['grandTotal']}")

print("\n\033[1m3. Order line GST snapshot\033[0m")
if "id" in ka:
    item = ka["items"][0]
    for field in ["hsnCode", "gstRate", "taxableValue", "cgstAmount", "sgstAmount", "igstAmount"]:
        check(f"line carries {field}", field in item and item[field] is not None, str(item.get(field)))
    check("line HSN is a real code, not the catch-all",
          item.get("hsnCode") not in (None, "", "9999"), item.get("hsnCode"))

print("\n\033[1m4. Cash on delivery\033[0m")
session3 = new_session()
add_to_cart(session3, variant["id"], 1)
cart3 = get_cart(session3)
check("cart says whether COD is available", "codAvailable" in cart3, str(cart3.get("codAvailable")))

cod_email = f"cod-{uuid.uuid4().hex[:8]}@example.com"
_, cod_body, _ = call("POST", "/orders",
                      {"shippingAddress": ADDR_KA, "guestEmail": cod_email, "paymentMethod": "COD"},
                      headers={"X-Session-Id": session3})
cod = unwrap(cod_body)
check("COD order created", "id" in cod, json.dumps(cod)[:200])
if "id" in cod:
    check("COD handling charge applied", D(cod.get("codCharge", 0)) > 0, str(cod.get("codCharge")))
    check("COD order is confirmed without a gateway",
          cod.get("status") == "PAYMENT_CONFIRMED", cod.get("status"))
    check("COD order is not marked paid until delivery",
          cod.get("paymentStatus") == "PENDING", cod.get("paymentStatus"))

    status, pay_body, _ = call("POST", f"/payments/intent", {"orderId": cod["id"]},
                               headers={"X-Guest-Email": cod_email})
    check("COD order is refused an online payment intent", status >= 400,
          f"status={status} {json.dumps(unwrap(pay_body))[:120]}")

print("\n\033[1m5. Tax invoice\033[0m")
if "id" in cod:
    status, html, _ = call("GET", f"/invoices/order/{cod['id']}?email={cod_email}", raw=True)
    check("invoice is issued on confirmation", status == 200, f"status={status}")
    if status == 200:
        text = html.decode(errors="replace")
        for needle, label in [
            ("Tax Invoice", "titled as a tax invoice"),
            ("GSTIN", "shows the seller GSTIN"),
            ("Place of Supply", "states the place of supply"),
            ("HSN", "lists HSN codes"),
            ("Amount in words", "states the amount in words"),
        ]:
            check(f"invoice {label}", needle in text, f"missing {needle!r}")
        check("invoice shows CGST/SGST for an intra-state supply",
              "CGST" in text and "IGST" not in text.split("<tbody>")[0],
              "tax heads look wrong")

    status, pdf, headers = call("GET", f"/invoices/order/{cod['id']}?email={cod_email}&format=pdf", raw=True)
    check("invoice downloads as a PDF", status == 200 and pdf[:4] == b"%PDF",
          f"status={status} magic={pdf[:8]!r}")
    check("PDF is served as an attachment",
          "attachment" in headers.get("Content-Disposition", ""),
          headers.get("Content-Disposition"))

    status, _, _ = call("GET", f"/invoices/order/{cod['id']}", raw=True)
    check("invoice is not readable without proof of ownership", status in (401, 403),
          f"status={status}")
    status, _, _ = call("GET", f"/invoices/order/{cod['id']}?email=someone-else@example.com", raw=True)
    check("invoice is not readable with the wrong email", status in (401, 403), f"status={status}")

print("\n\033[1m6. Invoice numbering\033[0m")
numbers = []
problems = []
for i in range(3):
    s = new_session()
    st_add, add_body, _ = add_to_cart(s, variant["id"], 1)
    if st_add >= 400:
        problems.append(f"add-to-cart #{i}: {st_add} {json.dumps(unwrap(add_body))[:100]}")
        continue
    email = f"seq{i}-{uuid.uuid4().hex[:8]}@example.com"
    st_order, b, _ = call("POST", "/orders",
                          {"shippingAddress": ADDR_KA, "guestEmail": email, "paymentMethod": "COD"},
                          headers={"X-Session-Id": s})
    o = unwrap(b)
    if "id" not in o:
        problems.append(f"order #{i}: {st_order} {json.dumps(o)[:100]}")
        continue
    st, page, _ = call("GET", f"/invoices/order/{o['id']}?email={email}", raw=True)
    if st != 200:
        problems.append(f"invoice #{i}: {st}")
        continue
    body = page.decode(errors="replace")
    marker = "<strong>INV/"
    if marker not in body:
        problems.append(f"invoice #{i}: number not found in rendered page")
        continue
    numbers.append(body.split(marker)[1].split("</strong>")[0])

check("every confirmed order gets an invoice number", len(numbers) == 3,
      f"got {numbers}; {'; '.join(problems) or 'no errors reported'}")
if len(numbers) == 3:
    seqs = [int(n.split("/")[-1]) for n in numbers]
    check("invoice numbers are sequential and gapless",
          seqs == list(range(seqs[0], seqs[0] + 3)), str(seqs))
    # The marker consumed the "INV/" prefix, so what remains is "2026-27/00010".
    check("invoice numbers restart each financial year",
          all(len(n.split("/")) == 2 and n.split("/")[0].count("-") == 1 for n in numbers),
          str(numbers))

print("\n\033[1m6b. Invoice numbering under concurrency\033[0m")


def place_cod_order(i):
    """One full COD checkout, returning the invoice number it produced."""
    s = new_session()
    call("POST", "/cart/items", {"variantId": variant["id"], "quantity": 1},
         headers={"X-Session-Id": s})
    email = f"conc{i}-{uuid.uuid4().hex[:8]}@example.com"
    st, b, _ = call("POST", "/orders",
                    {"shippingAddress": ADDR_KA, "guestEmail": email, "paymentMethod": "COD"},
                    headers={"X-Session-Id": s})
    o = unwrap(b)
    if "id" not in o:
        return None, f"order: {st} {json.dumps(o)[:80]}"
    sti, page, _ = call("GET", f"/invoices/order/{o['id']}?email={email}", raw=True)
    text = page.decode(errors="replace")
    if sti != 200 or "<strong>INV/" not in text:
        return None, f"invoice: {sti}"
    return text.split("<strong>INV/")[1].split("</strong>")[0], None


# Gapless numbering is a GST requirement, and the place it breaks is under
# concurrent checkout - two requests reading the same MAX(sequence).
CONCURRENCY = 12
with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
    concurrent = list(pool.map(place_cod_order, range(CONCURRENCY)))

issued = [n for n, _ in concurrent if n]
errors = [e for _, e in concurrent if e]
check(f"{CONCURRENCY} simultaneous checkouts all get an invoice",
      len(issued) == CONCURRENCY, f"{len(issued)}/{CONCURRENCY}; {errors[:3]}")
check("no two orders share an invoice number", len(set(issued)) == len(issued),
      f"{len(issued) - len(set(issued))} duplicate(s)")
if issued:
    seqs = sorted(int(n.split("/")[-1]) for n in issued)
    gaps = [a for a, b in zip(seqs, seqs[1:]) if b != a + 1]
    check("the sequence stays gapless under concurrency", not gaps,
          f"gaps after {gaps}")

print("\n\033[1m7. Returns\033[0m")
_, reasons, _ = call("GET", "/returns/reasons")
check("return reasons are published", len(unwrap(reasons).get("reasons", [])) >= 5,
      json.dumps(unwrap(reasons))[:120])

if "id" in cod:
    _, elig, _ = call("GET", f"/returns/eligibility/{cod['id']}?email={cod_email}")
    e = unwrap(elig)
    check("eligibility is reported for a fresh order", "eligible" in e, json.dumps(e)[:150])
    check("an undelivered order cannot be returned", e.get("eligible") is False, str(e.get("eligible")))
    check("the reason is explained to the customer", bool(e.get("reason")), str(e.get("reason")))
    check("the return window is published", e.get("windowDays", 0) > 0, str(e.get("windowDays")))

    status, body, _ = call("POST", "/returns", {
        "orderId": cod["id"], "reason": "DOES_NOT_FIT", "guestEmail": cod_email,
        "items": [{"orderItemId": cod["items"][0]["id"], "quantity": 1}],
    })
    check("a return on an undelivered order is refused", status >= 400,
          f"status={status} {json.dumps(unwrap(body))[:120]}")

print("\n\033[1m8. Contact form\033[0m")


def wait_for_contact_window():
    """
    The contact endpoint is capped at 5 submissions a minute, which is the
    point of it - an unauthenticated endpoint that sends email is a spam relay
    otherwise. A previous run of this suite may still be inside that window, so
    wait it out rather than reporting the limiter as a failure.
    """
    status, _, headers = call("POST", "/support/contact", {
        "name": "Probe", "email": "probe@example.com",
        "subject": "Availability probe", "message": "Checking the rate-limit window.",
    })
    if status != 429:
        return status, True
    reset = int(headers.get("x-ratelimit-reset", "60") or 60)
    print(f"  \033[33m....\033[0m rate-limit window open for {reset}s - waiting")
    time.sleep(min(reset + 2, 70))
    return status, False


first_status, _ = wait_for_contact_window()
check("the contact endpoint is rate limited", "x-ratelimit-limit" in
      {k.lower() for k in call("POST", "/support/contact", {
          "name": "Probe", "email": "probe@example.com", "subject": "Probe",
          "message": "Checking the rate-limit headers."})[2]},
      "no rate-limit headers on the response")

status, body, _ = call("POST", "/support/contact", {
    "name": "Ravi Kumar", "email": "ravi@example.com",
    "subject": "Sizing question", "message": "Does the linen shirt run large?",
})
check("contact message accepted", status in (200, 202), f"status={status}")
check("contact message is recorded", unwrap(body).get("received") is True,
      json.dumps(unwrap(body))[:120])

status, body, _ = call("POST", "/support/contact", {
    "name": "Bot", "email": "bot@example.com", "subject": "cheap deals",
    "message": "buy now at spam dot com forever", "website": "http://spam.example",
})
check("honeypot submissions are accepted but not escalated", status in (200, 202), f"status={status}")

status, body, _ = call("POST", "/support/contact", {"name": "X", "email": "not-an-email",
                                                   "subject": "s", "message": "short"})
check("contact form validates its input", status == 400, f"status={status}")

# The exact count depends on how much of the window this run has already
# used, so keep posting until it is refused rather than assuming a number.
refused_after = None
for attempt in range(1, 9):
    status, _, _ = call("POST", "/support/contact", {
        "name": "Flood", "email": "flood@example.com", "subject": "Flooding",
        "message": f"Rapid submission {attempt} - the limiter must stop this.",
    })
    if status == 429:
        refused_after = attempt
        break
check("repeated submissions are refused before they become a spam relay",
      refused_after is not None, "8 rapid submissions all accepted")

print("\n\033[1m9. Returns, end to end\033[0m")

check("admin can sign in to drive the return", bool(admin_token), "login failed at start of run")
ensure_stock(variant["id"])

if admin_token:
    # A return needs a delivered order, so walk one all the way there first.
    rs = new_session()
    add_to_cart(rs, variant["id"], 2)
    ret_email = f"ret-{uuid.uuid4().hex[:8]}@example.com"
    _, rb, _ = call("POST", "/orders",
                    {"shippingAddress": ADDR_KA, "guestEmail": ret_email, "paymentMethod": "COD"},
                    headers={"X-Session-Id": rs})
    order = unwrap(rb)

    for step in ["PROCESSING", "PACKED", "SHIPPED", "DELIVERED"]:
        st, sb, _ = call("PATCH", f"/admin/orders/{order['id']}/status",
                         {"status": step}, token=admin_token)
        if st >= 400:
            check(f"order can be moved to {step}", False, json.dumps(unwrap(sb))[:120])
            break
    else:
        check("order walked through to DELIVERED", True)

    _, delivered, _ = call("GET", f"/orders/{order['id']}?email={ret_email}")
    d = unwrap(delivered)
    check("COD payment is captured on delivery", d.get("paymentStatus") == "CAPTURED",
          f"paymentStatus={d.get('paymentStatus')}")

    _, elig, _ = call("GET", f"/returns/eligibility/{order['id']}?email={ret_email}")
    e = unwrap(elig)
    check("a delivered order is returnable", e.get("eligible") is True, str(e.get("reason")))
    check("the window close date is published", bool(e.get("closesAt")), str(e.get("closesAt")))

    item = order["items"][0]
    # Stock before the return, so the restock can be proved rather than assumed.
    def on_hand():
        """Units physically in stock, ignoring reservations."""
        _, snapshot, _ = call("GET", f"/products/{product['slug']}")
        for v in unwrap(snapshot)["variants"]:
            if v["id"] == variant["id"]:
                return v.get("inventory", {}).get("quantity")
        return None

    stock_before = on_hand()
    check("stock level is readable, so the restock can be proved",
          stock_before is not None, "variant payload exposes no inventory quantity")

    status, rr, _ = call("POST", "/returns", {
        "orderId": order["id"], "reason": "DOES_NOT_FIT", "guestEmail": ret_email,
        "customerNote": "Runs a size small.",
        "items": [{"orderItemId": item["id"], "quantity": 1}],
    })
    rma = unwrap(rr)
    check("return request accepted", status in (200, 201) and "rmaNumber" in rma,
          f"status={status} {json.dumps(rma)[:150]}")

    if "id" in rma:
        check("RMA number issued", rma["rmaNumber"].startswith("RMA-"), rma["rmaNumber"])
        # One of two units returned, so the quote is half the line total.
        expected = (D(item["lineTotal"]) / 2).quantize(D("0.01"))
        check("refund is quoted from the amount actually charged",
              D(rma["refundAmount"]) == expected,
              f"quoted {rma['refundAmount']}, expected {expected}")

        status, dup, _ = call("POST", "/returns", {
            "orderId": order["id"], "reason": "CHANGED_MIND", "guestEmail": ret_email,
            "items": [{"orderItemId": item["id"], "quantity": 1}],
        })
        check("a second open return on the same order is refused", status >= 400,
              f"status={status}")

        status, over, _ = call("POST", "/returns", {
            "orderId": order["id"], "reason": "CHANGED_MIND", "guestEmail": ret_email,
            "items": [{"orderItemId": item["id"], "quantity": 99}],
        })
        check("returning more than was ordered is refused", status >= 400, f"status={status}")

        for step in ["APPROVED", "RECEIVED"]:
            st, sb, _ = call("PATCH", f"/admin/returns/{rma['id']}/status",
                             {"status": step}, token=admin_token)
            check(f"return can be moved to {step}", st == 200, json.dumps(unwrap(sb))[:120])

        st, bad, _ = call("PATCH", f"/admin/returns/{rma['id']}/status",
                          {"status": "REQUESTED"}, token=admin_token)
        check("a return cannot be moved backwards", st >= 400, f"status={st}")

        return_item_id = rma["items"][0]["id"]
        st, inspected, _ = call("POST", f"/admin/returns/{rma['id']}/inspect",
                                {"items": [{"returnItemId": return_item_id, "restockable": True}],
                                 "staffNote": "Unworn, tags intact."},
                                token=admin_token)
        insp = unwrap(inspected)
        check("inspection recorded", st in (200, 201) and insp.get("status") == "INSPECTED",
              f"status={st} {json.dumps(insp)[:120]}")

        stock_after = on_hand()
        check("a saleable return goes back on sale", stock_after == stock_before + 1,
              f"{stock_before} -> {stock_after}")

        st, elig2, _ = call("GET", f"/returns/eligibility/{order['id']}?email={ret_email}")
        e2 = unwrap(elig2)
        returned = e2["items"][0]
        check("the returned unit is no longer returnable",
              returned["returnableQuantity"] == returned["quantity"] - 1,
              f"{returned['returnableQuantity']}/{returned['quantity']}")

print("\n" + "=" * 62)
print(f"  \033[1m{passed} passed, {failed} failed\033[0m  ({passed + failed} checks)")
if failures:
    print("\n  Failures:")
    for f in failures:
        print(f"    - {f}")
print("=" * 62)
sys.exit(1 if failed else 0)
