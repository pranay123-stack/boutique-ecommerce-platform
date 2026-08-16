import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ZERO, round2 } from '../../common/utils/money';
import { financialYearOf } from './financial-year';

export interface InvoiceCharge {
  label: string;
  hsnCode: string;
  gstRate: Prisma.Decimal;
  taxableValue: Prisma.Decimal;
  cgstAmount: Prisma.Decimal;
  sgstAmount: Prisma.Decimal;
  igstAmount: Prisma.Decimal;
  total: Prisma.Decimal;
}

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);
  private readonly series: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.series = config.get<string>('tax.invoicePrefix') ?? 'INV';
  }

  /**
   * Issue a tax invoice for an order, or return the one already issued.
   *
   * Invoice numbers must be **gapless** and sequential within a financial year
   * - that is a GST requirement, and it is why this does not use a Postgres
   * sequence: sequences leak numbers on rollback. Instead a transaction-scoped
   * advisory lock serialises issuance per (series, financial year) so the
   * MAX+1 read cannot race, and the whole thing rolls back atomically if the
   * insert fails. The UNIQUE(financialYear, series, sequence) index is the
   * backstop if any of that reasoning is ever wrong.
   */
  async issueForOrder(orderId: string): Promise<{ id: string; invoiceNumber: string }> {
    const existing = await this.prisma.invoice.findUnique({
      where: { orderId },
      select: { id: true, invoiceNumber: true },
    });
    if (existing) return existing;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, user: { select: { email: true, phone: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');

    const issuedAt = new Date();
    const financialYear = financialYearOf(issuedAt);
    const seller = this.sellerSnapshot();
    const buyer = this.buyerSnapshot(order);

    return this.prisma.$transaction(async (tx) => {
      // Serialise number allocation for this series and year. Released
      // automatically when the transaction ends, however it ends.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${this.series}:${financialYear}`}))`;

      // Re-check under the lock. The pre-flight check above is only a fast
      // path: the background listener and an on-demand download can both call
      // this for the same order, and whichever loses the race would otherwise
      // allocate a second number and then fail on the unique orderId - burning
      // a number and breaking the gapless sequence.
      const raced = await tx.invoice.findUnique({
        where: { orderId },
        select: { id: true, invoiceNumber: true },
      });
      if (raced) return raced;

      const last = await tx.invoice.findFirst({
        where: { financialYear, series: this.series },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });
      const sequence = (last?.sequence ?? 0) + 1;
      const invoiceNumber = `${this.series}/${financialYear}/${String(sequence).padStart(5, '0')}`;

      const invoice = await tx.invoice.create({
        data: {
          orderId: order.id,
          invoiceNumber,
          series: this.series,
          financialYear,
          sequence,
          issuedAt,
          sellerSnapshot: seller as unknown as Prisma.InputJsonValue,
          buyerSnapshot: buyer as unknown as Prisma.InputJsonValue,
          placeOfSupply: order.placeOfSupply ?? seller.state,
          isInterState: order.isInterState,
          taxableTotal: order.taxableTotal,
          cgstTotal: order.cgstTotal,
          sgstTotal: order.sgstTotal,
          igstTotal: order.igstTotal,
          // The invoice must state what was actually charged, so the round-off
          // recorded here is the one already applied to the order total.
          roundOff: this.roundOffOf(order),
          grandTotal: order.grandTotal,
          currency: order.currency,
        },
        select: { id: true, invoiceNumber: true },
      });

      this.logger.log(`Issued ${invoice.invoiceNumber} for order ${order.orderNumber}`);
      return invoice;
    });
  }

  /**
   * Everything a rendered invoice needs, in one shape.
   *
   * Issues the invoice if the order is confirmed but does not have one yet.
   * The listener that normally raises it runs asynchronously, so a customer
   * who clicks "download invoice" the instant checkout finishes would
   * otherwise race it and get a 404. Issuance is idempotent, so doing it here
   * costs nothing when the listener already won.
   */
  async viewForOrder(orderId: string) {
    let invoice = await this.prisma.invoice.findUnique({
      where: { orderId },
      include: { order: { include: { items: true } } },
    });

    if (!invoice) {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true },
      });
      if (!order) throw new NotFoundException('Order not found');
      // No supply has been made on a pending order, so no tax invoice is due.
      if (order.status === OrderStatus.PENDING) {
        throw new NotFoundException('No invoice yet - one is issued once the order is confirmed');
      }
      await this.issueForOrder(orderId);
      invoice = await this.prisma.invoice.findUnique({
        where: { orderId },
        include: { order: { include: { items: true } } },
      });
    }
    if (!invoice) throw new NotFoundException('No invoice has been issued for this order');

    const order = invoice.order;
    const charges: InvoiceCharge[] = [];

    // Delivery and COD handling are ancillary to the goods, so they carry the
    // principal supply's rate. Derived from the frozen order items rather than
    // the live catalogue - a reissued invoice must never restate itself.
    const principal = order.items.reduce<(typeof order.items)[number] | null>(
      (best, item) => (!best || item.lineTotal.greaterThan(best.lineTotal) ? item : best),
      null,
    );
    const rate = principal?.gstRate ?? ZERO();

    const addCharge = (label: string, amount: Prisma.Decimal) => {
      if (!amount.greaterThan(0)) return;
      const taxable = round2(amount.mul(100).div(rate.add(100)));
      const tax = round2(amount.sub(taxable));
      const half = round2(tax.div(2));
      charges.push({
        label,
        hsnCode: '996812',
        gstRate: rate,
        taxableValue: order.isInterState ? taxable : round2(amount.sub(half.mul(2))),
        cgstAmount: order.isInterState ? ZERO() : half,
        sgstAmount: order.isInterState ? ZERO() : half,
        igstAmount: order.isInterState ? tax : ZERO(),
        total: amount,
      });
    };
    addCharge('Delivery', order.shippingTotal);
    addCharge('Cash on delivery handling', order.codCharge);

    return {
      invoice,
      order,
      charges,
      seller: invoice.sellerSnapshot as Record<string, string>,
      buyer: invoice.buyerSnapshot as Record<string, string>,
    };
  }

  private roundOffOf(order: { grandTotal: Prisma.Decimal } & Record<string, unknown>) {
    const exact = round2(
      (order.taxableTotal as Prisma.Decimal)
        .add(order.cgstTotal as Prisma.Decimal)
        .add(order.sgstTotal as Prisma.Decimal)
        .add(order.igstTotal as Prisma.Decimal),
    );
    return round2(order.grandTotal.sub(exact));
  }

  private sellerSnapshot() {
    return {
      legalName: this.config.get<string>('tax.sellerLegalName') ?? '',
      tradeName: this.config.get<string>('tax.sellerTradeName') ?? '',
      gstin: this.config.get<string>('tax.sellerGstin') ?? '',
      pan: this.config.get<string>('tax.sellerPan') ?? '',
      address: this.config.get<string>('tax.sellerAddress') ?? '',
      state: this.config.get<string>('tax.sellerState') ?? '',
    };
  }

  private buyerSnapshot(order: {
    guestEmail: string | null;
    billingAddress: Prisma.JsonValue;
    shippingAddress: Prisma.JsonValue;
    user: { email: string; phone: string | null } | null;
  }) {
    const billing = (order.billingAddress ?? order.shippingAddress) as Record<string, string>;
    const shipping = order.shippingAddress as Record<string, string>;
    return {
      name: billing?.fullName ?? '',
      email: order.user?.email ?? order.guestEmail ?? '',
      phone: billing?.phone ?? order.user?.phone ?? '',
      billingAddress: this.formatAddress(billing),
      shippingAddress: this.formatAddress(shipping),
      state: billing?.state ?? '',
    };
  }

  private formatAddress(a: Record<string, string> | null): string {
    if (!a) return '';
    return [a.line1, a.line2, a.city, `${a.state ?? ''} ${a.postalCode ?? ''}`.trim(), a.country]
      .filter(Boolean)
      .join(', ');
  }
}
