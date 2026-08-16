# Compliance: GST, invoicing, COD and returns

This document covers the parts of the platform that exist because Indian law
requires them, rather than because a shopper asked for them. If you change
anything here, change it deliberately — these are the paths that decide whether
the business can legally take money.

---

## 1. GST-inclusive pricing

**Indian retail quotes prices inclusive of GST.** A scarf advertised at ₹2,450
must be charged at ₹2,450. The tax is *inside* that number, not added at
checkout.

This is the single most consequential decision in the pricing code, so it is
worth being precise about what it means:

```
Advertised price   2450.00   <- what the customer sees and pays
Taxable value      2333.32   <- backed out: price x 100 / (100 + rate)
GST @ 5%            116.68
                   -------
Charged            2450.00
```

Contrast with the tax-exclusive model, where 2450 + 122.50 = 2572.50 would be
charged. Getting this backwards overcharges every customer by the tax rate.

Set `TAX_PRICES_INCLUDE_GST=false` for a market that quotes ex-tax; the same
code path then adds the tax on top.

**Where it lives:** [`backend/src/modules/tax/gst.service.ts`](../backend/src/modules/tax/gst.service.ts)

### The rupee-and-paise details that matter

- **CGST must equal SGST, exactly.** This is a GST rule and a database CHECK
  constraint (`orders_cgst_equals_sgst`). When the tax works out to an odd
  number of paise — 116.67 — it cannot be halved at two decimal places. The
  half is rounded and doubled (58.34 × 2 = 116.68), and on an inclusive price
  the **taxable value absorbs the paisa**, because the one number that must not
  move is what the customer is charged.
- **Never both IGST and CGST/SGST.** Enforced in code and by
  `orders_gst_split_exclusive`.
- **The order total is rounded to the nearest rupee** and the adjustment is
  stated on the invoice as "Round off", which is standard Indian practice.
  Disable with `TAX_ROUND_OFF_TOTAL=false`.

---

## 2. Place of supply

Comparing the **seller's state** (`SELLER_STATE`) with the **delivery state**
decides the tax heads:

| Supply | Condition | Heads charged |
|---|---|---|
| Intra-state | delivery state == seller state | CGST + SGST, half the rate each |
| Inter-state | delivery state != seller state | IGST at the full rate |

An **unrecognised state falls back to inter-state (IGST)**. That is deliberate:
under-collecting CGST/SGST leaves the business funding the shortfall itself,
whereas over-collecting is recoverable.

State names are normalised, so `KARNATAKA`, `karnataka`, `Tamilnadu` and
`New Delhi` all resolve. The GST state code (the first two digits of a GSTIN)
is stored on the order as `placeOfSupplyCode`.

> **Set `SELLER_STATE` correctly before going live.** Getting it wrong makes
> *every* invoice charge the wrong heads of tax.

---

## 3. HSN codes and rates

Every invoice line needs an HSN code. Classification is the merchant's legal
responsibility; the platform ships a starting point for a clothing and homeware
boutique in
[`backend/src/modules/tax/hsn-catalogue.ts`](../backend/src/modules/tax/hsn-catalogue.ts),
kept in one file precisely so it has one place to be reviewed.

The part people get wrong: **readymade garments are rated on the sale value per
piece** — 5% up to ₹1,000, 12% above. A single flat rate per product silently
under-collects on the expensive half of the catalogue.

- Products created through the admin are classified from their category unless
  the merchant supplies an HSN code explicitly.
- `taxRatePercent` is validated against the statutory slabs
  (0, 0.25, 3, 5, 12, 18, 28). A typo like 15% would otherwise be charged to
  real customers and reported on a real return.
- Unclassified goods fall back to HSN `9999` at 18%.

**Review the catalogue against the current rate notifications before going
live.** Ship it wrong and every invoice is wrong.

---

## 4. Tax invoices

A tax invoice is raised the moment an order is confirmed for fulfilment —
prepaid or COD — because GST requires one at or before the removal of goods.

**Numbering is gapless and sequential within a financial year:**

```
INV/2026-27/00001
 ^      ^       ^
 |      |       sequence, restarts each financial year
 |      Indian FY: 1 April to 31 March
 series (INVOICE_PREFIX)
```

This does **not** use a Postgres sequence, because sequences leak numbers on
rollback and a gap in an invoice series is a compliance problem. Instead:

1. A transaction-scoped advisory lock serialises issuance per (series, FY).
2. Under that lock, an existing invoice for the order short-circuits — the
   background listener and an on-demand download can both call this.
3. `MAX(sequence) + 1` is read and the row inserted in the same transaction.
4. `UNIQUE(financialYear, series, sequence)` is the backstop.

Verified with 20 simultaneous checkouts: 20 invoices, zero duplicates, zero
gaps. The check is part of the functional suite
(`tests/functional/gst-cod-invoice-returns.py`, section 6b).

### Contents

Every field required by Rule 46 of the CGST Rules is rendered: supplier name,
address and GSTIN; a consecutive invoice number; date; recipient details; HSN
codes; taxable value; the rate and amount of tax split by head; place of
supply; and the total in words (Indian units — lakh and crore, not millions).

Served as printable HTML by default, or as a PDF with `?format=pdf`. The PDF is
drawn with `pdfkit` rather than rendered by a headless browser: Chromium would
add ~300MB to the image and a process to supervise, for a document that is a
table and some headings.

**Access:** an invoice carries the customer's name, address and phone number,
so it is gated exactly like the order — the owning account, a guest who can
quote the checkout email, or staff with `order:read`.

```
GET /api/v1/invoices/order/:orderId            # HTML
GET /api/v1/invoices/order/:orderId?format=pdf # PDF
GET /api/v1/invoices/order/:orderId?email=...  # guest orders
```

---

## 5. Cash on delivery

COD is the majority of Indian e-commerce volume, so it is a first-class payment
path rather than a fallback.

- The order is **confirmed for dispatch immediately** — there is no gateway to
  wait for — while `paymentStatus` stays `PENDING`. The money is not in yet,
  and the books have to say so.
- Stock is **committed at confirmation**, not at payment.
- A `Payment` row with provider `COD` is created so refunds, reconciliation and
  the admin views have one shape to work with regardless of method.
- Marking the order **DELIVERED** captures the payment (`markCodCollected`).
- Cancelling before delivery marks that payment `FAILED`, so cash that will
  never be collected does not sit on the books.
- Requesting an online payment intent for a COD order is **refused** — it would
  let a customer pay twice.

Configuration: `COD_ENABLED`, `COD_CHARGE`, `COD_MIN_ORDER`, `COD_MAX_ORDER`.
The handling charge is GST-inclusive and taxed at the principal supply rate.

> **A subtlety worth remembering.** Unwinding a cancelled order must key off
> `status`, not `paymentStatus`: a COD order is committed while still unpaid,
> so releasing a *reservation* that no longer exists would corrupt the stock
> counts. `PENDING` is the only status where stock is still merely reserved.

---

## 6. Delivery and COD charges under GST

Delivery and COD handling are **ancillary to the supply of goods**, so under the
composite-supply rule they take the rate of the principal supply — the GST rate
of the highest-value line — rather than a rate of their own. They appear as
their own rows on the invoice under SAC `996812`.

---

## 7. Returns

Returns are modelled separately from refunds, because the two are not the same
event: a return can be rejected on inspection and never produce a refund, and a
refund can be issued without a return (an undelivered parcel).

### Lifecycle

```
REQUESTED ──► APPROVED ──► PICKUP_SCHEDULED ──► IN_TRANSIT ──► RECEIVED
    │             │                │                              │
    ▼             ▼                ▼                              ▼
 REJECTED     CANCELLED        CANCELLED                      INSPECTED
                                                                  │
                                                        ┌─────────┴────────┐
                                                        ▼                  ▼
                                                    REFUNDED           REJECTED
```

Enforced by `RETURN_STATUS_TRANSITIONS`, with unit tests asserting that a
settled return can never be reopened, that only `INSPECTED` can lead to
`REFUNDED`, and that no status is unreachable.

### Rules that are enforced, not just documented

- **Only delivered orders**, within `RETURN_WINDOW_DAYS` of the delivery event
  (read from the order status history, not from "now").
- **One open return per order** — a partial unique index
  (`return_requests_one_open_per_order`). Two concurrent requests would each
  price the full refund and could pay out twice.
- **Quantities are capped** at what was ordered minus what has already been
  returned.
- **Refunds are priced from the amount actually charged** — the line total
  divided by the ordered quantity — so the credit note reverses exactly what
  the invoice raised, discount and GST included.
- **Delivery is refunded only when the fault is ours**
  (`MERCHANT_FAULT_REASONS`).
- **Restocking happens at inspection, never at receipt.** An item that comes
  back damaged must not be sold again, and until someone has looked at it,
  nobody knows which it is. Items that fail inspection refund nothing and are
  returned to the customer.

---

## 8. What the merchant must supply before going live

These are the client's own particulars. The platform ships placeholders so
`docker compose up` works out of the box, and the storefront policy pages show
an unmistakable **"This policy is not ready to publish"** banner until the real
values are set — deliberately, because a polished policy page with invented
company details is worse than an obviously unfinished one.

### Backend (`backend/.env`)

| Variable | Why it matters |
|---|---|
| `SELLER_GSTIN` | A tax invoice without the seller's real GSTIN is defective |
| `SELLER_LEGAL_NAME` | Registered name, as on the GST certificate |
| `SELLER_ADDRESS` | Registered place of business |
| `SELLER_STATE` | Decides CGST+SGST vs IGST on **every** order |
| `SELLER_PAN` | Printed on the invoice |
| `INVOICE_PREFIX` | Invoice series. Do not change mid-year |

### Frontend (build-time — `NEXT_PUBLIC_*` values are inlined by Next)

`NEXT_PUBLIC_LEGAL_NAME`, `NEXT_PUBLIC_GSTIN`, `NEXT_PUBLIC_BUSINESS_ADDRESS`,
`NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_SUPPORT_PHONE`,
`NEXT_PUBLIC_GRIEVANCE_OFFICER` (required by the IT Act, 2000),
`NEXT_PUBLIC_GRIEVANCE_EMAIL`, `NEXT_PUBLIC_JURISDICTION`.

Changing any of these **requires a frontend rebuild** — they are compiled in,
not read at runtime.

### Keep in step

`RETURN_WINDOW_DAYS` (backend) and `NEXT_PUBLIC_RETURN_WINDOW_DAYS` (frontend)
must match, or the published policy promises something the API refuses. Same
for `COD_CHARGE` / `NEXT_PUBLIC_COD_CHARGE`.

---

## 9. What this platform does *not* do

Stated plainly, so nobody discovers it after launch:

- **No e-invoicing (IRN/QR).** Mandatory above the current turnover threshold.
  A new boutique is well below it, but this must be added before the business
  crosses it.
- **No e-way bills.** Required for consignments above ₹50,000 in most states.
- **No GSTR-1/GSTR-3B filing or export.** Invoice data is queryable, but
  returns are filed by the merchant's accountant from it.
- **No TCS under Section 52.** Applies to marketplaces, not to a boutique
  selling its own goods.
- **The policy text is a working draft, not legal advice.** Have it reviewed by
  a lawyer before publishing.

---

## 10. Testing

| Suite | Covers |
|---|---|
| `backend/src/modules/tax/gst.service.spec.ts` | Inclusive/exclusive maths, place of supply, the CGST=SGST invariant across 30 amount/rate combinations |
| `backend/src/modules/tax/hsn-catalogue.spec.ts` | Price-threshold apparel rates, statutory-slab-only output |
| `backend/src/modules/invoices/financial-year.spec.ts` | FY boundaries, century roll, amount-in-words in Indian units |
| `backend/src/modules/returns/returns.service.spec.ts` | Lifecycle graph: no reopening, no unreachable status, refund only after inspection |
| `tests/functional/gst-cod-invoice-returns.py` | 71 checks against a running API, including 12 concurrent checkouts proving gapless numbering, and a full return driven to restock |
| `tests/e2e/compliance.spec.ts` | Policy pages, sitemap, robots, contact form, GST display, a COD checkout through the UI ending in a tax invoice |

```bash
# Backend units
cd backend && npx jest

# Compliance sweep against a running API
python3 tests/functional/gst-cod-invoice-returns.py --base http://localhost:4100/api/v1

# Browser
cd tests && E2E_NO_SERVER=1 npx playwright test e2e/compliance.spec.ts
```
