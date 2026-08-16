import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CouponScope, CouponType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate, skipOf, type PageParams } from '../../common/dto/pagination.dto';
import { ZERO, money, percentOf, round2 } from '../../common/utils/money';
import type { CreateCouponDto, UpdateCouponDto } from './dto/coupon.dto';

export interface CouponEligibleLine {
  productId: string | null;
  categoryId: string | null;
  lineTotal: Prisma.Decimal;
}

export interface CouponEvaluation {
  couponId: string;
  code: string;
  type: CouponType;
  discount: Prisma.Decimal;
  freeShipping: boolean;
  description: string | null;
}

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluate a coupon against a concrete basket.
   *
   * Returns the exact discount rather than a flag, so cart preview and order
   * creation cannot drift apart - both call this and both get the same number.
   * Throws with a customer-readable reason when the coupon does not apply.
   */
  async evaluate(
    code: string,
    lines: CouponEligibleLine[],
    subtotal: Prisma.Decimal,
    userId?: string,
  ): Promise<CouponEvaluation> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: code.toUpperCase() },
      include: { categories: { select: { id: true } }, products: { select: { id: true } } },
    });

    if (!coupon || !coupon.isActive) {
      throw new BadRequestException('This coupon code is not valid');
    }

    const now = new Date();
    if (coupon.startsAt > now) throw new BadRequestException('This coupon is not active yet');
    if (coupon.expiresAt && coupon.expiresAt < now) {
      throw new BadRequestException('This coupon has expired');
    }
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      throw new BadRequestException('This coupon has reached its usage limit');
    }

    if (userId && coupon.usageLimitPerUser !== null) {
      const used = await this.prisma.couponRedemption.count({
        where: { couponId: coupon.id, userId },
      });
      if (used >= coupon.usageLimitPerUser) {
        throw new BadRequestException('You have already used this coupon');
      }
    }

    if (subtotal.lessThan(coupon.minOrderValue)) {
      throw new BadRequestException(
        `This coupon requires a minimum order of ${coupon.minOrderValue.toFixed(2)}`,
      );
    }

    // Scope narrows which lines the discount is computed against.
    const eligibleTotal = this.eligibleTotal(coupon, lines);
    if (eligibleTotal.lessThanOrEqualTo(0)) {
      throw new BadRequestException('This coupon does not apply to any item in your cart');
    }

    let discount = ZERO();
    let freeShipping = false;

    switch (coupon.type) {
      case CouponType.PERCENTAGE: {
        discount = percentOf(eligibleTotal, coupon.value);
        if (coupon.maxDiscountAmount && discount.greaterThan(coupon.maxDiscountAmount)) {
          discount = money(coupon.maxDiscountAmount);
        }
        break;
      }
      case CouponType.FIXED: {
        // Never discount more than the eligible goods are worth.
        discount = coupon.value.greaterThan(eligibleTotal) ? eligibleTotal : money(coupon.value);
        break;
      }
      case CouponType.FREE_SHIPPING: {
        freeShipping = true;
        break;
      }
    }

    return {
      couponId: coupon.id,
      code: coupon.code,
      type: coupon.type,
      discount: round2(discount),
      freeShipping,
      description: coupon.description,
    };
  }

  private eligibleTotal(
    coupon: {
      scope: CouponScope;
      categories: Array<{ id: string }>;
      products: Array<{ id: string }>;
    },
    lines: CouponEligibleLine[],
  ): Prisma.Decimal {
    if (coupon.scope === CouponScope.ALL) {
      return lines.reduce<Prisma.Decimal>((sum, l) => sum.add(l.lineTotal), ZERO());
    }
    const categoryIds = new Set(coupon.categories.map((c) => c.id));
    const productIds = new Set(coupon.products.map((p) => p.id));

    return lines.reduce<Prisma.Decimal>((sum, line) => {
      const matches =
        coupon.scope === CouponScope.CATEGORY
          ? line.categoryId !== null && categoryIds.has(line.categoryId)
          : line.productId !== null && productIds.has(line.productId);
      return matches ? sum.add(line.lineTotal) : sum;
    }, ZERO());
  }

  /** Record a redemption. Runs inside the order transaction so it cannot be lost. */
  async redeem(
    tx: Prisma.TransactionClient,
    couponId: string,
    orderId: string,
    userId: string | null,
    discountAmount: Prisma.Decimal,
  ): Promise<void> {
    await tx.coupon.update({
      where: { id: couponId },
      data: { usedCount: { increment: 1 } },
    });
    await tx.couponRedemption.create({
      data: { couponId, orderId, userId, discountAmount },
    });
  }

  // ------------------------------------------------------------------ admin

  async findAll(query: PageParams & { search?: string; activeOnly?: boolean }) {
    const where: Prisma.CouponWhereInput = {
      ...(query.search ? { code: { contains: query.search.toUpperCase() } } : {}),
      ...(query.activeOnly ? { isActive: true } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: skipOf(query),
        take: query.limit,
        include: { _count: { select: { redemptions: true } } },
      }),
      this.prisma.coupon.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      include: {
        categories: { select: { id: true, name: true } },
        products: { select: { id: true, name: true } },
        _count: { select: { redemptions: true } },
      },
    });
    if (!coupon) throw new NotFoundException('Coupon not found');
    return coupon;
  }

  async create(dto: CreateCouponDto) {
    this.assertConsistent(dto);
    return this.prisma.coupon.create({
      data: {
        code: dto.code.toUpperCase(),
        description: dto.description ?? null,
        type: dto.type,
        value: new Prisma.Decimal(dto.value),
        scope: dto.scope ?? CouponScope.ALL,
        minOrderValue: new Prisma.Decimal(dto.minOrderValue ?? 0),
        maxDiscountAmount:
          dto.maxDiscountAmount !== undefined ? new Prisma.Decimal(dto.maxDiscountAmount) : null,
        usageLimit: dto.usageLimit ?? null,
        usageLimitPerUser: dto.usageLimitPerUser ?? 1,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : new Date(),
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        isActive: dto.isActive ?? true,
        ...(dto.categoryIds?.length
          ? { categories: { connect: dto.categoryIds.map((id) => ({ id })) } }
          : {}),
        ...(dto.productIds?.length
          ? { products: { connect: dto.productIds.map((id) => ({ id })) } }
          : {}),
      },
    });
  }

  async update(id: string, dto: UpdateCouponDto) {
    await this.findOne(id);
    this.assertConsistent(dto);
    return this.prisma.coupon.update({
      where: { id },
      data: {
        ...(dto.code ? { code: dto.code.toUpperCase() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.type ? { type: dto.type } : {}),
        ...(dto.value !== undefined ? { value: new Prisma.Decimal(dto.value) } : {}),
        ...(dto.scope ? { scope: dto.scope } : {}),
        ...(dto.minOrderValue !== undefined
          ? { minOrderValue: new Prisma.Decimal(dto.minOrderValue) }
          : {}),
        ...(dto.maxDiscountAmount !== undefined
          ? { maxDiscountAmount: new Prisma.Decimal(dto.maxDiscountAmount) }
          : {}),
        ...(dto.usageLimit !== undefined ? { usageLimit: dto.usageLimit } : {}),
        ...(dto.usageLimitPerUser !== undefined
          ? { usageLimitPerUser: dto.usageLimitPerUser }
          : {}),
        ...(dto.startsAt ? { startsAt: new Date(dto.startsAt) } : {}),
        ...(dto.expiresAt !== undefined
          ? { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.categoryIds
          ? { categories: { set: dto.categoryIds.map((cid) => ({ id: cid })) } }
          : {}),
        ...(dto.productIds
          ? { products: { set: dto.productIds.map((pid) => ({ id: pid })) } }
          : {}),
      },
    });
  }

  async remove(id: string) {
    const redemptions = await this.prisma.couponRedemption.count({ where: { couponId: id } });
    if (redemptions > 0) {
      // Deactivate rather than delete: redemption history must survive.
      return this.prisma.coupon.update({ where: { id }, data: { isActive: false } });
    }
    return this.prisma.coupon.delete({ where: { id } });
  }

  private assertConsistent(dto: Partial<CreateCouponDto>): void {
    if (dto.type === CouponType.PERCENTAGE && dto.value !== undefined && dto.value > 100) {
      throw new BadRequestException('A percentage coupon cannot exceed 100');
    }
    if (dto.startsAt && dto.expiresAt && new Date(dto.expiresAt) <= new Date(dto.startsAt)) {
      throw new BadRequestException('Expiry must be after the start date');
    }
    if (dto.scope === CouponScope.CATEGORY && !dto.categoryIds?.length) {
      throw new BadRequestException('Category-scoped coupons need at least one category');
    }
    if (dto.scope === CouponScope.PRODUCT && !dto.productIds?.length) {
      throw new BadRequestException('Product-scoped coupons need at least one product');
    }
  }
}
