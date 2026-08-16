# Go-live checklist

Work top to bottom. Everything in **Blocking** must be done before the store
takes a single real payment; nothing below it will save you if one of those is
missed.

---

## Blocking — the store cannot legally or safely trade without these

### Merchant identity and tax

- [ ] `SELLER_GSTIN` set to the real GSTIN
- [ ] `SELLER_LEGAL_NAME`, `SELLER_ADDRESS`, `SELLER_PAN` set from the GST certificate
- [ ] **`SELLER_STATE` set correctly** — this decides CGST+SGST vs IGST on every order
- [ ] `INVOICE_PREFIX` agreed with the accountant, and not to be changed mid-year
- [ ] HSN codes and GST rates reviewed against the current rate notifications
      ([`hsn-catalogue.ts`](../backend/src/modules/tax/hsn-catalogue.ts))
- [ ] Every live product has an HSN code (none left on the `9999` catch-all):
      ```sql
      SELECT name FROM products WHERE "hsnCode" IS NULL OR "hsnCode" = '9999';
      ```
- [ ] A test order placed and its invoice checked line by line by the accountant

### Legal pages

- [ ] `NEXT_PUBLIC_LEGAL_NAME`, `NEXT_PUBLIC_GSTIN`, `NEXT_PUBLIC_BUSINESS_ADDRESS`
- [ ] `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_SUPPORT_PHONE`
- [ ] `NEXT_PUBLIC_GRIEVANCE_OFFICER` and `NEXT_PUBLIC_GRIEVANCE_EMAIL`
      (required by the IT Act, 2000)
- [ ] `NEXT_PUBLIC_JURISDICTION`
- [ ] Frontend **rebuilt** after setting them — these are compiled in, not read at runtime
- [ ] The "not ready to publish" banner is gone from `/privacy` (it is the
      built-in check that nothing was missed)
- [ ] **Policy text reviewed by a lawyer.** What ships is a working draft
      written for an Indian D2C boutique, not legal advice
- [ ] Return window, refund timelines and shipping charges on the policy pages
      match the configured values

### Payments

- [ ] Razorpay account live-activated and KYC complete
- [ ] `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` are **live** keys
- [ ] `RAZORPAY_WEBHOOK_SECRET` set and the webhook registered against the
      production URL
- [ ] `PAYMENT_MODE=live` and `COMPOSE_NODE_ENV=production`
      (the API refuses to boot in production with mock providers — that guard
      is there to stop exactly this mistake)
- [ ] One real payment of a small amount taken end to end, then refunded
- [ ] Settlement account verified with Razorpay

### Shipping

- [ ] Shiprocket account created, KYC done, pickup address registered
- [ ] `SHIPROCKET_EMAIL` / `SHIPROCKET_PASSWORD` / `SHIPPING_PICKUP_POSTCODE` set
- [ ] `SHIPPING_MODE=live`
- [ ] One real shipment booked and tracked to delivery
- [ ] COD remittance cycle confirmed with the courier

### Notifications

- [ ] `NOTIFICATIONS_MODE=live`
- [ ] SMTP credentials set, and SPF/DKIM/DMARC published for the sending domain
      (without these, order confirmations land in spam)
- [ ] `SUPPORT_INBOX` points at a mailbox someone actually reads
- [ ] SMS/WhatsApp provider credentials set, if those channels are being used
- [ ] A real order confirmation received in Gmail, Outlook and on a phone

### Secrets and infrastructure

- [ ] `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_SECRET`, `CSRF_SECRET`
      regenerated — **never** the development values
- [ ] Database password changed from the compose default
- [ ] `SEED_ADMIN_PASSWORD` changed, or the seeded admin removed entirely
- [ ] TLS terminating in front of the app, HTTP redirecting to HTTPS
- [ ] `TRUST_PROXY` set to the number of proxy hops — without it every customer
      behind the load balancer shares one rate-limit bucket and the whole store
      starts returning 429
- [ ] `CORS_ORIGINS` and `FRONTEND_URL` set to the production domain
- [ ] `THROTTLE_USE_REDIS=true` — with in-memory counters, N instances permit
      N times the intended limit

---

## Strongly recommended before launch

- [ ] Automated database backups, **and a restore actually tested**
- [ ] Error tracking wired up (Sentry DSN or equivalent)
- [ ] Uptime monitoring on `/health/live` and on the storefront homepage
- [ ] Log retention configured
- [ ] `NEXT_PUBLIC_ALLOW_INDEXING=false` on staging, so a duplicate copy of the
      shop never competes with the real one in search results
- [ ] `sitemap.xml` submitted to Google Search Console
- [ ] A real customer walked through the whole journey on a phone
- [ ] Staff trained on the admin: orders, returns, inventory, messages
- [ ] Someone owns the `/admin/messages` inbox

---

## Deliberately not built

Say these out loud to the client now, not after launch.

| Not built | When it becomes necessary |
|---|---|
| E-invoicing (IRN/QR) | Above the current turnover threshold |
| E-way bills | Consignments above ₹50,000 in most states |
| GSTR-1 / GSTR-3B export | The accountant files from invoice data as it stands |
| Multi-currency / international shipping | Only if selling outside India |
| Marketplace/multi-vendor | Single-seller by design |
| Loyalty points, gift cards, subscriptions | Not in scope |

---

## Post-launch, first week

- [ ] Watch error rates and p99 latency daily
- [ ] Reconcile every payment against Razorpay settlements
- [ ] Check that invoice numbers are still sequential with no gaps:
      ```sql
      SELECT "financialYear", series, count(*), min(sequence), max(sequence),
             max(sequence) - min(sequence) + 1 AS expected
      FROM invoices GROUP BY 1, 2;
      -- count and expected must be equal
      ```
- [ ] Confirm COD collections match courier remittances
- [ ] Read the contact-form inbox
- [ ] Review the first returns end to end before the process is on autopilot
