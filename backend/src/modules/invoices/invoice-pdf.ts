import PDFDocument from 'pdfkit';
import type { Prisma } from '@prisma/client';
import { amountInWords } from './amount-in-words';
import type { InvoiceView } from './invoice-html';

const inr = (v: Prisma.Decimal | string | number): string =>
  Number(v.toString()).toLocaleString('en-IN', { minimumFractionDigits: 2 });

/**
 * The same invoice as a PDF.
 *
 * Drawn with pdfkit rather than rendered from the HTML by a headless browser:
 * Chromium would add ~300MB to the image and a process to supervise, for a
 * document that is a table and some headings. Rupee amounts are prefixed
 * "Rs." because the built-in Helvetica font has no glyph for the rupee sign
 * and would silently emit a blank box.
 */
export function renderInvoicePdf(view: InvoiceView): Promise<Buffer> {
  const { invoice, order, charges, seller, buyer } = view;
  const interState = invoice.isInterState;

  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;

  // ---------------------------------------------------------------- header
  doc.fontSize(16).font('Helvetica-Bold').text('TAX INVOICE', left, 40);
  doc.fontSize(8).font('Helvetica').fillColor('#666').text('Original for Recipient');
  doc.fillColor('#000');

  const headerTop = doc.y + 8;
  doc.fontSize(10).font('Helvetica-Bold').text(seller.legalName, left, headerTop, { width: 300 });
  doc.fontSize(8).font('Helvetica');
  if (seller.address) doc.text(seller.address, { width: 300 });
  doc.text(`GSTIN: ${seller.gstin || 'Not registered'}`, { width: 300 });
  if (seller.pan) doc.text(`PAN: ${seller.pan}`, { width: 300 });

  const meta: Array<[string, string]> = [
    ['Invoice No.', invoice.invoiceNumber],
    ['Invoice Date', invoice.issuedAt.toLocaleDateString('en-IN')],
    ['Order No.', order.orderNumber],
    ['Order Date', order.placedAt.toLocaleDateString('en-IN')],
    ['Place of Supply', invoice.placeOfSupply ?? '-'],
  ];
  let metaY = headerTop;
  for (const [label, value] of meta) {
    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#666')
      .text(label, right - 240, metaY, {
        width: 100,
        align: 'right',
      });
    doc
      .font('Helvetica-Bold')
      .fillColor('#000')
      .text(value, right - 135, metaY, {
        width: 135,
        align: 'right',
      });
    metaY += 12;
  }

  doc.y = Math.max(doc.y, metaY) + 10;
  doc.moveTo(left, doc.y).lineTo(right, doc.y).lineWidth(1).stroke('#000');
  doc.y += 10;

  // --------------------------------------------------------------- parties
  const partyTop = doc.y;
  const half = width / 2 - 6;
  const party = (title: string, name: string, address: string, x: number, extra?: string) => {
    doc
      .fontSize(7)
      .font('Helvetica-Bold')
      .fillColor('#666')
      .text(title.toUpperCase(), x, partyTop, { width: half });
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .fillColor('#000')
      .text(name, x, doc.y + 2, { width: half });
    doc.fontSize(8).font('Helvetica').text(address, x, doc.y, { width: half });
    if (extra) doc.text(extra, x, doc.y, { width: half });
    return doc.y;
  };
  const yA = party(
    'Billed to',
    buyer.name,
    buyer.billingAddress,
    left,
    [buyer.phone, buyer.email].filter(Boolean).join(' | '),
  );
  const yB = party('Shipped to', buyer.name, buyer.shippingAddress, left + half + 12);
  doc.y = Math.max(yA, yB) + 12;

  // ----------------------------------------------------------------- table
  // Column widths sum to the content width; the tax columns collapse from two
  // (CGST + SGST) to one (IGST) depending on the supply type.
  const taxHeads = interState ? ['IGST'] : ['CGST', 'SGST'];
  const taxWidth = interState ? 60 : 30;
  const cols = [
    { label: '#', w: 16, align: 'left' as const },
    { label: 'Description', w: 150, align: 'left' as const },
    { label: 'HSN', w: 38, align: 'left' as const },
    { label: 'Qty', w: 26, align: 'right' as const },
    { label: 'Rate', w: 52, align: 'right' as const },
    { label: 'Taxable', w: 58, align: 'right' as const },
    { label: 'GST', w: 30, align: 'right' as const },
    ...taxHeads.map((label) => ({ label, w: taxWidth, align: 'right' as const })),
    { label: 'Total', w: 60, align: 'right' as const },
  ];
  const totalW = cols.reduce((s, c) => s + c.w, 0);
  const scale = width / totalW;
  cols.forEach((c) => (c.w *= scale));

  const drawRow = (cells: string[], opts: { bold?: boolean; fill?: string } = {}) => {
    const rowTop = doc.y;
    doc.fontSize(7.5).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica');
    // Measure first so the row background and separator match the tallest cell.
    const heights = cells.map((text, i) =>
      doc.heightOfString(text ?? '', { width: cols[i].w - 6 }),
    );
    const rowHeight = Math.max(...heights) + 6;

    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom - 120) {
      doc.addPage();
      doc.y = doc.page.margins.top;
    }
    if (opts.fill) {
      doc.rect(left, doc.y, width, rowHeight).fill(opts.fill);
      doc.fillColor('#000');
    }
    let x = left;
    cells.forEach((text, i) => {
      doc.fillColor(opts.bold ? '#333' : '#000').text(text ?? '', x + 3, rowTop + 3, {
        width: cols[i].w - 6,
        align: cols[i].align,
      });
      x += cols[i].w;
    });
    doc.fillColor('#000');
    doc.y = rowTop + rowHeight;
    doc.moveTo(left, doc.y).lineTo(right, doc.y).lineWidth(0.4).stroke('#ddd');
  };

  drawRow(
    cols.map((c) => c.label),
    { bold: true, fill: '#f5f5f4' },
  );

  order.items.forEach((item, i) => {
    const description = [item.productName, item.variantName, `SKU ${item.sku}`]
      .filter(Boolean)
      .join('\n');
    drawRow([
      String(i + 1),
      description,
      item.hsnCode ?? '-',
      String(item.quantity),
      inr(item.unitPrice),
      inr(item.taxableValue),
      `${Number(item.gstRate.toString())}%`,
      ...(interState ? [inr(item.igstAmount)] : [inr(item.cgstAmount), inr(item.sgstAmount)]),
      inr(item.lineTotal),
    ]);
  });

  charges.forEach((c, i) => {
    drawRow([
      String(order.items.length + i + 1),
      c.label,
      c.hsnCode,
      '1',
      inr(c.total),
      inr(c.taxableValue),
      `${Number(c.gstRate.toString())}%`,
      ...(interState ? [inr(c.igstAmount)] : [inr(c.cgstAmount), inr(c.sgstAmount)]),
      inr(c.total),
    ]);
  });

  // ---------------------------------------------------------------- totals
  doc.y += 10;
  const totals: Array<[string, string, boolean]> = [
    ['Taxable value', inr(invoice.taxableTotal), false],
    ...(interState
      ? ([['IGST', inr(invoice.igstTotal), false]] as Array<[string, string, boolean]>)
      : ([
          ['CGST', inr(invoice.cgstTotal), false],
          ['SGST', inr(invoice.sgstTotal), false],
        ] as Array<[string, string, boolean]>)),
    ...(order.discountTotal.greaterThan(0)
      ? ([['Discount', `-${inr(order.discountTotal)}`, false]] as Array<[string, string, boolean]>)
      : []),
    ...(!invoice.roundOff.isZero()
      ? ([['Round off', inr(invoice.roundOff), false]] as Array<[string, string, boolean]>)
      : []),
    ['Total', `Rs. ${inr(invoice.grandTotal)}`, true],
  ];

  const boxLeft = right - 200;
  totals.forEach(([label, value, bold]) => {
    if (bold) {
      doc.moveTo(boxLeft, doc.y).lineTo(right, doc.y).lineWidth(1).stroke('#000');
      doc.y += 4;
    }
    doc.fontSize(bold ? 10 : 8.5).font(bold ? 'Helvetica-Bold' : 'Helvetica');
    const rowY = doc.y;
    doc.text(label, boxLeft, rowY, { width: 100 });
    doc.text(value, boxLeft + 100, rowY, { width: 100, align: 'right' });
    doc.y = rowY + (bold ? 16 : 13);
  });

  doc.y += 8;
  doc.fontSize(7).font('Helvetica').fillColor('#666').text('Amount in words', left, doc.y);
  doc
    .fontSize(9)
    .font('Helvetica-Bold')
    .fillColor('#000')
    .text(amountInWords(invoice.grandTotal.toString()), left, doc.y + 2, { width: width - 210 });

  // ---------------------------------------------------------------- footer
  doc.y += 16;
  doc.moveTo(left, doc.y).lineTo(right, doc.y).lineWidth(0.4).stroke('#ddd');
  doc.y += 8;
  const footY = doc.y;
  doc
    .fontSize(7)
    .font('Helvetica')
    .fillColor('#666')
    .text(
      'Prices are inclusive of GST. This is a computer-generated invoice and does not require a signature.',
      left,
      footY,
      { width: width - 180 },
    );
  doc
    .fontSize(8)
    .font('Helvetica-Bold')
    .fillColor('#000')
    .text(`For ${seller.legalName}`, right - 170, footY, { width: 170, align: 'right' });
  doc
    .fontSize(7)
    .font('Helvetica')
    .fillColor('#666')
    .text('Authorised signatory', right - 170, doc.y + 14, { width: 170, align: 'right' });

  doc.end();
  return done;
}
