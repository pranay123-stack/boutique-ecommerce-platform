import type { Prisma } from '@prisma/client';
import { amountInWords } from './amount-in-words';
import type { InvoiceCharge } from './invoices.service';

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const inr = (v: Prisma.Decimal | string | number): string =>
  Number(v.toString()).toLocaleString('en-IN', { minimumFractionDigits: 2 });

export interface InvoiceView {
  invoice: {
    invoiceNumber: string;
    issuedAt: Date;
    placeOfSupply: string | null;
    isInterState: boolean;
    taxableTotal: Prisma.Decimal;
    cgstTotal: Prisma.Decimal;
    sgstTotal: Prisma.Decimal;
    igstTotal: Prisma.Decimal;
    roundOff: Prisma.Decimal;
    grandTotal: Prisma.Decimal;
  };
  order: {
    orderNumber: string;
    placedAt: Date;
    discountTotal: Prisma.Decimal;
    couponCode: string | null;
    items: Array<{
      productName: string;
      variantName: string | null;
      sku: string;
      hsnCode: string | null;
      quantity: number;
      unitPrice: Prisma.Decimal;
      discountAmount: Prisma.Decimal;
      gstRate: Prisma.Decimal;
      taxableValue: Prisma.Decimal;
      cgstAmount: Prisma.Decimal;
      sgstAmount: Prisma.Decimal;
      igstAmount: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
    }>;
  };
  charges: InvoiceCharge[];
  seller: Record<string, string>;
  buyer: Record<string, string>;
}

/**
 * A GST tax invoice as printable HTML.
 *
 * Rendered as a plain string rather than through a template engine so the
 * output has no runtime dependency and can be diffed in a test. Every field
 * required by Rule 46 of the CGST Rules appears here: supplier name, address
 * and GSTIN, a consecutive invoice number, date, recipient details, HSN codes,
 * taxable value, the rate and amount of tax split by head, place of supply and
 * the total in words.
 */
export function renderInvoiceHtml(view: InvoiceView): string {
  const { invoice, order, charges, seller, buyer } = view;
  const interState = invoice.isInterState;

  const taxCols = interState
    ? '<th class="num">IGST</th>'
    : '<th class="num">CGST</th><th class="num">SGST</th>';

  const rows = order.items
    .map((item, i) => {
      const taxCells = interState
        ? `<td class="num">${inr(item.igstAmount)}</td>`
        : `<td class="num">${inr(item.cgstAmount)}</td><td class="num">${inr(item.sgstAmount)}</td>`;
      return `<tr>
        <td>${i + 1}</td>
        <td>
          <strong>${esc(item.productName)}</strong>
          ${item.variantName ? `<br><span class="muted">${esc(item.variantName)}</span>` : ''}
          <br><span class="muted">SKU ${esc(item.sku)}</span>
        </td>
        <td>${esc(item.hsnCode ?? '-')}</td>
        <td class="num">${item.quantity}</td>
        <td class="num">${inr(item.unitPrice)}</td>
        <td class="num">${item.discountAmount.greaterThan(0) ? `-${inr(item.discountAmount)}` : '-'}</td>
        <td class="num">${inr(item.taxableValue)}</td>
        <td class="num">${Number(item.gstRate.toString())}%</td>
        ${taxCells}
        <td class="num">${inr(item.lineTotal)}</td>
      </tr>`;
    })
    .join('');

  const chargeRows = charges
    .map((c, i) => {
      const taxCells = interState
        ? `<td class="num">${inr(c.igstAmount)}</td>`
        : `<td class="num">${inr(c.cgstAmount)}</td><td class="num">${inr(c.sgstAmount)}</td>`;
      return `<tr>
        <td>${order.items.length + i + 1}</td>
        <td>${esc(c.label)}</td>
        <td>${esc(c.hsnCode)}</td>
        <td class="num">1</td>
        <td class="num">${inr(c.total)}</td>
        <td class="num">-</td>
        <td class="num">${inr(c.taxableValue)}</td>
        <td class="num">${Number(c.gstRate.toString())}%</td>
        ${taxCells}
        <td class="num">${inr(c.total)}</td>
      </tr>`;
    })
    .join('');

  const taxSummary = interState
    ? `<tr><td>IGST</td><td class="num">${inr(invoice.igstTotal)}</td></tr>`
    : `<tr><td>CGST</td><td class="num">${inr(invoice.cgstTotal)}</td></tr>
       <tr><td>SGST</td><td class="num">${inr(invoice.sgstTotal)}</td></tr>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Tax Invoice ${esc(invoice.invoiceNumber)}</title>
<style>
  *{box-sizing:border-box}
  body{font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1c1917;margin:0;padding:32px;background:#fff}
  .sheet{max-width:920px;margin:0 auto}
  h1{font-size:20px;letter-spacing:.08em;text-transform:uppercase;margin:0 0 4px}
  .muted{color:#78716c;font-size:11px}
  .head{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #1c1917;padding-bottom:16px;margin-bottom:16px}
  .parties{display:flex;gap:24px;margin-bottom:16px}
  .party{flex:1;border:1px solid #e7e5e4;padding:12px;border-radius:4px}
  .party h3{margin:0 0 6px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#78716c}
  table{width:100%;border-collapse:collapse;margin-bottom:16px}
  th,td{border:1px solid #e7e5e4;padding:6px 8px;text-align:left;vertical-align:top}
  th{background:#fafaf9;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:#57534e}
  .num{text-align:right;white-space:nowrap}
  .totals{width:340px;margin-left:auto}
  .totals td{border:none;padding:4px 8px}
  .totals .grand td{border-top:2px solid #1c1917;font-weight:700;font-size:15px;padding-top:8px}
  .words{border:1px solid #e7e5e4;padding:10px;border-radius:4px;margin-bottom:16px}
  footer{margin-top:24px;border-top:1px solid #e7e5e4;padding-top:12px;display:flex;justify-content:space-between;gap:24px}
  @media print{body{padding:0}.noprint{display:none}}
</style></head>
<body><div class="sheet">
  <div class="head">
    <div>
      <h1>Tax Invoice</h1>
      <div class="muted">Original for Recipient</div>
      <div style="margin-top:12px"><strong>${esc(seller.legalName)}</strong>
        ${seller.tradeName && seller.tradeName !== seller.legalName ? `<br><span class="muted">trading as ${esc(seller.tradeName)}</span>` : ''}
        <br>${esc(seller.address)}
        <br>GSTIN: <strong>${esc(seller.gstin || 'Not registered')}</strong>
        ${seller.pan ? `<br>PAN: ${esc(seller.pan)}` : ''}
      </div>
    </div>
    <div class="num">
      <table style="width:auto">
        <tr><th>Invoice No.</th><td><strong>${esc(invoice.invoiceNumber)}</strong></td></tr>
        <tr><th>Invoice Date</th><td>${invoice.issuedAt.toLocaleDateString('en-IN')}</td></tr>
        <tr><th>Order No.</th><td>${esc(order.orderNumber)}</td></tr>
        <tr><th>Order Date</th><td>${order.placedAt.toLocaleDateString('en-IN')}</td></tr>
        <tr><th>Place of Supply</th><td>${esc(invoice.placeOfSupply ?? '-')}</td></tr>
      </table>
    </div>
  </div>

  <div class="parties">
    <div class="party"><h3>Billed to</h3>
      <strong>${esc(buyer.name)}</strong><br>${esc(buyer.billingAddress)}
      ${buyer.phone ? `<br>${esc(buyer.phone)}` : ''}${buyer.email ? `<br>${esc(buyer.email)}` : ''}
    </div>
    <div class="party"><h3>Shipped to</h3>
      <strong>${esc(buyer.name)}</strong><br>${esc(buyer.shippingAddress)}
    </div>
  </div>

  <table>
    <thead><tr>
      <th>#</th><th>Description</th><th>HSN</th><th class="num">Qty</th>
      <th class="num">Rate</th><th class="num">Disc.</th><th class="num">Taxable</th>
      <th class="num">GST</th>${taxCols}<th class="num">Total</th>
    </tr></thead>
    <tbody>${rows}${chargeRows}</tbody>
  </table>

  <div class="words"><span class="muted">Amount in words</span><br>
    <strong>${esc(amountInWords(invoice.grandTotal.toString()))}</strong></div>

  <table class="totals">
    <tr><td>Taxable value</td><td class="num">${inr(invoice.taxableTotal)}</td></tr>
    ${taxSummary}
    ${order.discountTotal.greaterThan(0) ? `<tr><td>Discount${order.couponCode ? ` (${esc(order.couponCode)})` : ''}</td><td class="num">-${inr(order.discountTotal)}</td></tr>` : ''}
    ${!invoice.roundOff.isZero() ? `<tr><td>Round off</td><td class="num">${invoice.roundOff.greaterThan(0) ? '+' : ''}${inr(invoice.roundOff)}</td></tr>` : ''}
    <tr class="grand"><td>Total</td><td class="num">₹${inr(invoice.grandTotal)}</td></tr>
  </table>

  <footer>
    <div class="muted">
      Prices are inclusive of GST. This is a computer-generated invoice and
      does not require a signature.
    </div>
    <div class="num"><strong>For ${esc(seller.legalName)}</strong><br>
      <span class="muted">Authorised signatory</span></div>
  </footer>
</div></body></html>`;
}
