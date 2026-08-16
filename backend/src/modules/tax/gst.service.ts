import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { ZERO, money, round2 } from '../../common/utils/money';
import { DEFAULT_HSN, normaliseState, stateCode } from './gst.constants';

export interface GstLineInput {
  /** Amount actually charged for the line, after discount. */
  chargedAmount: Prisma.Decimal;
  gstRate: Prisma.Decimal;
  hsnCode?: string | null;
}

export interface GstLineResult {
  hsnCode: string;
  gstRate: Prisma.Decimal;
  taxableValue: Prisma.Decimal;
  cgstRate: Prisma.Decimal;
  cgstAmount: Prisma.Decimal;
  sgstRate: Prisma.Decimal;
  sgstAmount: Prisma.Decimal;
  igstRate: Prisma.Decimal;
  igstAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
}

export interface SupplyContext {
  isInterState: boolean;
  placeOfSupply: string;
  placeOfSupplyCode: string | null;
  sellerGstin: string;
  sellerState: string;
}

/**
 * Indian GST computation.
 *
 * Two rules drive everything here:
 *
 *  1. Retail prices in India are quoted GST-inclusive. A scarf advertised at
 *     2,450 must be charged at 2,450 - the tax is *inside* that number, not
 *     added at checkout. So the taxable value is backed out of the price
 *     (price x 100 / (100 + rate)) rather than the tax being added on top.
 *     Set TAX_PRICES_INCLUDE_GST=false for a market that quotes ex-tax.
 *
 *  2. Whether a supply is intra-state or inter-state decides the split. Same
 *     state as the seller means CGST + SGST at half the rate each; a different
 *     state means IGST at the full rate. Never both.
 */
@Injectable()
export class GstService {
  private readonly logger = new Logger(GstService.name);
  private readonly pricesIncludeGst: boolean;
  private readonly sellerState: string;
  private readonly sellerGstin: string;

  constructor(config: ConfigService) {
    this.pricesIncludeGst = config.get<boolean>('tax.pricesIncludeGst') ?? true;
    this.sellerState = config.get<string>('tax.sellerState') ?? 'Karnataka';
    this.sellerGstin = config.get<string>('tax.sellerGstin') ?? '';
  }

  get inclusive(): boolean {
    return this.pricesIncludeGst;
  }

  /** Decide the supply type from the delivery address. */
  resolveSupply(deliveryState: string | undefined | null): SupplyContext {
    const buyer = normaliseState(deliveryState ?? '');
    const seller = normaliseState(this.sellerState);
    // An unrecognised state is treated as inter-state: IGST is the safer
    // default, since under-collecting CGST/SGST creates a liability the
    // business has to fund itself.
    const known = Boolean(stateCode(buyer));
    if (!known && deliveryState) {
      this.logger.warn(`Unrecognised delivery state "${deliveryState}"; treating as inter-state`);
    }

    return {
      isInterState: !known || buyer !== seller,
      placeOfSupply: deliveryState ?? this.sellerState,
      placeOfSupplyCode: stateCode(buyer) ?? null,
      sellerGstin: this.sellerGstin,
      sellerState: this.sellerState,
    };
  }

  /**
   * Split one line's charge into taxable value and GST components.
   *
   * `chargedAmount` is what the customer pays for the line after discount.
   */
  computeLine(input: GstLineInput, supply: SupplyContext): GstLineResult {
    const rate = money(input.gstRate ?? 0);
    const charged = money(input.chargedAmount);
    const hsnCode = input.hsnCode || DEFAULT_HSN;

    // Back the tax out of an inclusive price, or add it to an exclusive one.
    let taxableValue = this.pricesIncludeGst
      ? round2(charged.mul(100).div(rate.add(100)))
      : round2(charged);

    let taxAmount = this.pricesIncludeGst
      ? round2(charged.sub(taxableValue))
      : round2(taxableValue.mul(rate).div(100));

    if (supply.isInterState) {
      return {
        hsnCode,
        gstRate: rate,
        taxableValue,
        cgstRate: ZERO(),
        cgstAmount: ZERO(),
        sgstRate: ZERO(),
        sgstAmount: ZERO(),
        igstRate: rate,
        igstAmount: taxAmount,
        taxAmount,
      };
    }

    // Intra-state: CGST and SGST must be *exactly* equal - that is a GST rule
    // and a database CHECK constraint, not a rounding preference. When the tax
    // works out to an odd number of paise (116.67) it cannot be halved at 2dp,
    // so the half is rounded and doubled. On an inclusive price the taxable
    // value then absorbs that paisa, because the one number that must not move
    // is what the customer is charged: an item advertised at 2,450 is charged
    // at 2,450, whatever the split underneath.
    const half = round2(taxAmount.div(2));
    taxAmount = round2(half.mul(2));
    if (this.pricesIncludeGst) {
      taxableValue = round2(charged.sub(taxAmount));
    }
    const halfRate = round2(rate.div(2));

    return {
      hsnCode,
      gstRate: rate,
      taxableValue,
      cgstRate: halfRate,
      cgstAmount: half,
      sgstRate: halfRate,
      sgstAmount: half,
      igstRate: ZERO(),
      igstAmount: ZERO(),
      taxAmount,
    };
  }

  /** Sum line results into the order-level GST totals. */
  totals(lines: GstLineResult[]) {
    const sum = (pick: (l: GstLineResult) => Prisma.Decimal) =>
      round2(lines.reduce<Prisma.Decimal>((acc, l) => acc.add(pick(l)), ZERO()));

    return {
      taxableTotal: sum((l) => l.taxableValue),
      cgstTotal: sum((l) => l.cgstAmount),
      sgstTotal: sum((l) => l.sgstAmount),
      igstTotal: sum((l) => l.igstAmount),
      taxTotal: sum((l) => l.taxAmount),
    };
  }
}
