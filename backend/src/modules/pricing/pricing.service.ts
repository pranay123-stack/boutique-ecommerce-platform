import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { CouponsService, type CouponEvaluation } from '../coupons/coupons.service';
import { GstService, type GstLineResult, type SupplyContext } from '../tax/gst.service';
import { ZERO, add, money, multiply, round2, subtract } from '../../common/utils/money';

export type PaymentMethod = 'PREPAID' | 'COD';

export interface PricingInputLine {
  variantId: string;
  productId: string;
  categoryId: string;
  sku: string;
  productName: string;
  variantName: string;
  imageUrl: string | null;
  unitPrice: Prisma.Decimal;
  quantity: number;
  taxRatePercent: Prisma.Decimal;
  weightGrams: number;
  hsnCode?: string | null;
}

// The GST result carries a resolved, non-null HSN, so it wins over the
// optional one on the input line.
export interface PricedLine extends Omit<PricingInputLine, 'hsnCode'>, GstLineResult {
  lineSubtotal: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  /** What the customer is charged for this line after discount. */
  taxableAmount: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
}

/** GST on a non-goods charge (delivery, COD handling) shown as its own row. */
export interface PricedCharge extends GstLineResult {
  label: string;
  amount: Prisma.Decimal;
}

export interface PricedBasket {
  lines: PricedLine[];
  subtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  shippingTotal: Prisma.Decimal;
  codCharge: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  taxableTotal: Prisma.Decimal;
  cgstTotal: Prisma.Decimal;
  sgstTotal: Prisma.Decimal;
  igstTotal: Prisma.Decimal;
  roundOff: Prisma.Decimal;
  grandTotal: Prisma.Decimal;
  charges: PricedCharge[];
  totalWeightGrams: number;
  coupon: (CouponEvaluation & { applied: true }) | null;
  couponError: string | null;
  paymentMethod: PaymentMethod;
  isInterState: boolean;
  placeOfSupply: string;
  placeOfSupplyCode: string | null;
  sellerGstin: string;
  pricesIncludeGst: boolean;
}

export interface PriceOptions {
  couponCode?: string | null;
  userId?: string | null;
  shippingOverride?: Prisma.Decimal | null;
  /** Delivery state - decides CGST+SGST vs IGST. */
  deliveryState?: string | null;
  paymentMethod?: PaymentMethod;
}

/**
 * The single source of truth for what a basket costs.
 *
 * Cart preview, checkout and order creation all price through this service.
 * Duplicating the arithmetic in two places is the classic way a storefront
 * ends up charging a different number than it displayed.
 *
 * Prices are GST-inclusive by default (the Indian retail norm), so the tax is
 * backed out of the advertised price rather than added at checkout. See
 * {@link GstService}.
 */
@Injectable()
export class PricingService {
  private readonly freeShippingThreshold: Prisma.Decimal;
  private readonly flatShippingRate: Prisma.Decimal;
  private readonly codEnabled: boolean;
  private readonly codCharge: Prisma.Decimal;
  private readonly codMinOrder: Prisma.Decimal;
  private readonly codMaxOrder: Prisma.Decimal;
  private readonly roundOffTotal: boolean;

  constructor(
    private readonly coupons: CouponsService,
    private readonly gst: GstService,
    config: ConfigService,
  ) {
    this.freeShippingThreshold = money(config.get<number>('shipping.freeThreshold') ?? 1999);
    this.flatShippingRate = money(config.get<number>('shipping.flatRate') ?? 99);
    this.codEnabled = config.get<boolean>('payment.cod.enabled') ?? true;
    this.codCharge = money(config.get<number>('payment.cod.charge') ?? 49);
    this.codMinOrder = money(config.get<number>('payment.cod.minOrder') ?? 0);
    this.codMaxOrder = money(config.get<number>('payment.cod.maxOrder') ?? 20000);
    this.roundOffTotal = config.get<boolean>('tax.roundOffTotal') ?? true;
  }

  /** Whether COD may be offered for a basket of this value. */
  codAvailability(goodsAfterDiscount: Prisma.Decimal): { available: boolean; reason?: string } {
    if (!this.codEnabled) return { available: false, reason: 'Cash on delivery is unavailable' };
    if (goodsAfterDiscount.lessThan(this.codMinOrder)) {
      return {
        available: false,
        reason: `Cash on delivery needs an order of at least ₹${this.codMinOrder.toFixed(0)}`,
      };
    }
    if (goodsAfterDiscount.greaterThan(this.codMaxOrder)) {
      return {
        available: false,
        reason: `Cash on delivery is not available above ₹${this.codMaxOrder.toFixed(0)}`,
      };
    }
    return { available: true };
  }

  async price(inputLines: PricingInputLine[], options: PriceOptions = {}): Promise<PricedBasket> {
    const paymentMethod: PaymentMethod = options.paymentMethod ?? 'PREPAID';
    const supply = this.gst.resolveSupply(options.deliveryState);

    if (inputLines.length === 0) {
      return this.emptyBasket(supply, paymentMethod);
    }

    const withSubtotals = inputLines.map((line) => ({
      ...line,
      lineSubtotal: round2(multiply(line.unitPrice, line.quantity)),
    }));

    const subtotal = round2(
      withSubtotals.reduce<Prisma.Decimal>((sum, l) => sum.add(l.lineSubtotal), ZERO()),
    );

    // ------------------------------------------------------------- coupon
    let coupon: CouponEvaluation | null = null;
    let couponError: string | null = null;

    if (options.couponCode) {
      try {
        coupon = await this.coupons.evaluate(
          options.couponCode,
          withSubtotals.map((l) => ({
            productId: l.productId,
            categoryId: l.categoryId,
            lineTotal: l.lineSubtotal,
          })),
          subtotal,
          options.userId ?? undefined,
        );
      } catch (err) {
        // An invalid coupon must not block checkout - report and price without it.
        couponError = (err as Error).message;
        coupon = null;
      }
    }

    const discountTotal = coupon ? coupon.discount : ZERO();

    // ------------------------------------------------- discount allocation
    // Spread the basket-level discount across lines in proportion to value so
    // that per-line GST is computed on the amount actually charged. The final
    // line absorbs any rounding remainder, keeping the sum exact.
    const lines: PricedLine[] = [];
    let allocated = ZERO();

    withSubtotals.forEach((line, index) => {
      const isLast = index === withSubtotals.length - 1;
      let lineDiscount: Prisma.Decimal;

      if (discountTotal.isZero() || subtotal.isZero()) {
        lineDiscount = ZERO();
      } else if (isLast) {
        lineDiscount = subtract(discountTotal, allocated);
      } else {
        lineDiscount = round2(discountTotal.mul(line.lineSubtotal).div(subtotal));
        allocated = allocated.add(lineDiscount);
      }

      const chargedAmount = round2(subtract(line.lineSubtotal, lineDiscount));
      const gst = this.gst.computeLine(
        { chargedAmount, gstRate: line.taxRatePercent, hsnCode: line.hsnCode },
        supply,
      );

      lines.push({
        ...line,
        ...gst,
        discountAmount: lineDiscount,
        taxableAmount: chargedAmount,
        // Inclusive pricing: taxable + tax is exactly what was charged.
        // Exclusive pricing: tax is added, so the line total grows.
        lineTotal: round2(add(gst.taxableValue, gst.taxAmount)),
      });
    });

    const goodsCharged = round2(lines.reduce<Prisma.Decimal>((s, l) => s.add(l.lineTotal), ZERO()));

    // ----------------------------------------------------------- shipping
    const goodsAfterDiscount = round2(subtract(subtotal, discountTotal));
    let shippingTotal =
      options.shippingOverride ??
      (goodsAfterDiscount.greaterThanOrEqualTo(this.freeShippingThreshold)
        ? ZERO()
        : this.flatShippingRate);

    if (coupon?.freeShipping) shippingTotal = ZERO();
    shippingTotal = round2(shippingTotal);

    // --------------------------------------------------------------- COD
    let codCharge = ZERO();
    if (paymentMethod === 'COD') {
      const availability = this.codAvailability(goodsAfterDiscount);
      if (!availability.available) {
        throw new BadRequestException(availability.reason ?? 'Cash on delivery is unavailable');
      }
      codCharge = round2(this.codCharge);
    }

    // ------------------------------------------------- GST on the charges
    // Delivery and COD handling are ancillary to the supply of goods, so under
    // the composite-supply rule they take the rate of the principal supply
    // rather than a rate of their own.
    const principalRate = this.principalRate(lines);
    const charges: PricedCharge[] = [];
    if (shippingTotal.greaterThan(0)) {
      charges.push({
        label: 'Delivery',
        amount: shippingTotal,
        ...this.gst.computeLine(
          { chargedAmount: shippingTotal, gstRate: principalRate, hsnCode: '996812' },
          supply,
        ),
      });
    }
    if (codCharge.greaterThan(0)) {
      charges.push({
        label: 'Cash on delivery handling',
        amount: codCharge,
        ...this.gst.computeLine(
          { chargedAmount: codCharge, gstRate: principalRate, hsnCode: '996812' },
          supply,
        ),
      });
    }

    const gstTotals = this.gst.totals([...lines, ...charges]);
    const chargesTotal = round2(
      charges.reduce<Prisma.Decimal>((s, c) => s.add(add(c.taxableValue, c.taxAmount)), ZERO()),
    );

    // Indian invoices round the payable amount to the nearest rupee and state
    // the adjustment explicitly, so the two always reconcile.
    const exactTotal = round2(add(goodsCharged, chargesTotal));
    const grandTotal = this.roundOffTotal
      ? exactTotal.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
      : exactTotal;
    const roundOff = round2(subtract(grandTotal, exactTotal));

    return {
      lines,
      subtotal,
      discountTotal: round2(discountTotal),
      shippingTotal,
      codCharge,
      taxTotal: gstTotals.taxTotal,
      taxableTotal: gstTotals.taxableTotal,
      cgstTotal: gstTotals.cgstTotal,
      sgstTotal: gstTotals.sgstTotal,
      igstTotal: gstTotals.igstTotal,
      roundOff,
      grandTotal: round2(grandTotal),
      charges,
      totalWeightGrams: lines.reduce((s, l) => s + l.weightGrams * l.quantity, 0),
      coupon: coupon ? { ...coupon, applied: true } : null,
      couponError,
      paymentMethod,
      isInterState: supply.isInterState,
      placeOfSupply: supply.placeOfSupply,
      placeOfSupplyCode: supply.placeOfSupplyCode,
      sellerGstin: supply.sellerGstin,
      pricesIncludeGst: this.gst.inclusive,
    };
  }

  /**
   * The rate of the principal supply - the GST rate of the highest-value line.
   * Ancillary charges follow it.
   */
  private principalRate(lines: PricedLine[]): Prisma.Decimal {
    let best: PricedLine | null = null;
    for (const line of lines) {
      if (!best || line.taxableAmount.greaterThan(best.taxableAmount)) best = line;
    }
    return best ? best.gstRate : ZERO();
  }

  private emptyBasket(supply: SupplyContext, paymentMethod: PaymentMethod): PricedBasket {
    return {
      lines: [],
      subtotal: ZERO(),
      discountTotal: ZERO(),
      shippingTotal: ZERO(),
      codCharge: ZERO(),
      taxTotal: ZERO(),
      taxableTotal: ZERO(),
      cgstTotal: ZERO(),
      sgstTotal: ZERO(),
      igstTotal: ZERO(),
      roundOff: ZERO(),
      grandTotal: ZERO(),
      charges: [],
      totalWeightGrams: 0,
      coupon: null,
      couponError: null,
      paymentMethod,
      isInterState: supply.isInterState,
      placeOfSupply: supply.placeOfSupply,
      placeOfSupplyCode: supply.placeOfSupplyCode,
      sellerGstin: supply.sellerGstin,
      pricesIncludeGst: this.gst.inclusive,
    };
  }
}
