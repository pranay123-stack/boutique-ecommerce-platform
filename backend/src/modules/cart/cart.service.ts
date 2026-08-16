import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PricingService, type PricingInputLine } from '../pricing/pricing.service';
import type { AddToCartDto } from './dto/cart.dto';

export interface CartIdentity {
  userId?: string;
  sessionId?: string;
}

/**
 * Shopping cart.
 *
 * Carts are server-side and identified either by user id (members) or an
 * anonymous session id (guests). Keeping the cart on the server means it
 * survives device changes, can be recovered for abandonment campaigns, and -
 * critically - prices are re-resolved from the catalogue on every read rather
 * than trusted from the client.
 */
@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  private identityWhere(identity: CartIdentity): Prisma.CartWhereInput {
    if (identity.userId) return { userId: identity.userId };
    if (identity.sessionId) return { sessionId: identity.sessionId };
    throw new BadRequestException('A user session or session id is required');
  }

  private async getOrCreateCart(identity: CartIdentity) {
    const existing = await this.prisma.cart.findFirst({
      where: { ...this.identityWhere(identity), status: 'ACTIVE' },
    });
    if (existing) return existing;

    return this.prisma.cart.create({
      data: {
        userId: identity.userId ?? null,
        sessionId: identity.userId ? null : (identity.sessionId ?? null),
        status: 'ACTIVE',
        // Guest carts are reaped after 30 days by the cleanup job.
        expiresAt: identity.userId ? null : new Date(Date.now() + 30 * 24 * 3600 * 1000),
      },
    });
  }

  /** Full cart with live pricing. Never trusts stored line prices for totals. */
  async getCart(identity: CartIdentity) {
    const cart = await this.prisma.cart.findFirst({
      where: { ...this.identityWhere(identity), status: 'ACTIVE' },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            variant: {
              include: {
                inventory: true,
                product: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                    categoryId: true,
                    taxRatePercent: true,
                    hsnCode: true,
                    images: { where: { variantId: null }, take: 1, orderBy: { position: 'asc' } },
                  },
                },
                images: { take: 1, orderBy: { position: 'asc' } },
              },
            },
          },
        },
      },
    });

    if (!cart) return this.emptyCart();

    // Drop lines whose variant was retired since it was added.
    const liveItems = cart.items.filter((i) => i.variant.isActive && !i.variant.deletedAt);

    const inputLines: PricingInputLine[] = liveItems.map((item) => ({
      variantId: item.variantId,
      productId: item.variant.product.id,
      categoryId: item.variant.product.categoryId,
      sku: item.variant.sku,
      productName: item.variant.product.name,
      variantName: item.variant.name,
      imageUrl: item.variant.images[0]?.url ?? item.variant.product.images[0]?.url ?? null,
      // Current catalogue price wins over whatever was snapshotted at add time.
      unitPrice: item.variant.discountPrice ?? item.variant.price,
      quantity: item.quantity,
      taxRatePercent: item.variant.product.taxRatePercent,
      weightGrams: item.variant.weightGrams,
      hsnCode: item.variant.product.hsnCode,
    }));

    const priced = await this.pricing.price(inputLines, {
      couponCode: cart.couponCode,
      userId: identity.userId ?? null,
    });

    // Prices are GST-inclusive, so the cart total is the same whether the
    // supply turns out to be intra- or inter-state. Only the split changes,
    // and that is settled once a delivery address is known at checkout.
    const codAvailability = this.pricing.codAvailability(priced.subtotal.sub(priced.discountTotal));

    // Price the COD variant here rather than letting the storefront add the
    // handling charge itself. Money arithmetic in two places is how a cart
    // ends up showing a different number than the one that gets charged.
    const codPriced = codAvailability.available
      ? await this.pricing.price(inputLines, {
          couponCode: cart.couponCode,
          userId: identity.userId ?? null,
          paymentMethod: 'COD',
        })
      : null;

    const availabilityByVariant = new Map(
      liveItems.map((i) => [
        i.variantId,
        Math.max(
          0,
          (i.variant.inventory?.quantity ?? 0) - (i.variant.inventory?.reservedQuantity ?? 0),
        ),
      ]),
    );

    return {
      id: cart.id,
      couponCode: cart.couponCode,
      currency: cart.currency,
      items: priced.lines.map((line) => {
        const item = liveItems.find((i) => i.variantId === line.variantId)!;
        const available = availabilityByVariant.get(line.variantId) ?? 0;
        return {
          id: item.id,
          variantId: line.variantId,
          productId: line.productId,
          productName: line.productName,
          productSlug: item.variant.product.slug,
          variantName: line.variantName,
          sku: line.sku,
          imageUrl: line.imageUrl,
          unitPrice: line.unitPrice,
          quantity: line.quantity,
          lineSubtotal: line.lineSubtotal,
          discountAmount: line.discountAmount,
          taxAmount: line.taxAmount,
          taxableValue: line.taxableValue,
          gstRate: line.gstRate,
          lineTotal: line.lineTotal,
          available,
          // Surfaced so the UI can flag problems before the customer hits pay.
          hasStockIssue: available < line.quantity,
        };
      }),
      itemCount: priced.lines.reduce((s, l) => s + l.quantity, 0),
      subtotal: priced.subtotal,
      discountTotal: priced.discountTotal,
      shippingTotal: priced.shippingTotal,
      taxTotal: priced.taxTotal,
      taxableTotal: priced.taxableTotal,
      roundOff: priced.roundOff,
      grandTotal: priced.grandTotal,
      pricesIncludeGst: priced.pricesIncludeGst,
      codAvailable: codAvailability.available,
      codUnavailableReason: codAvailability.reason ?? null,
      codCharge: codPriced?.codCharge ?? new Prisma.Decimal(0),
      codGrandTotal: codPriced?.grandTotal ?? null,
      coupon: priced.coupon,
      couponError: priced.couponError,
      hasStockIssues: priced.lines.some(
        (l) => (availabilityByVariant.get(l.variantId) ?? 0) < l.quantity,
      ),
    };
  }

  private emptyCart() {
    return {
      id: null,
      couponCode: null,
      currency: 'INR',
      items: [],
      itemCount: 0,
      subtotal: new Prisma.Decimal(0),
      discountTotal: new Prisma.Decimal(0),
      shippingTotal: new Prisma.Decimal(0),
      taxTotal: new Prisma.Decimal(0),
      taxableTotal: new Prisma.Decimal(0),
      roundOff: new Prisma.Decimal(0),
      grandTotal: new Prisma.Decimal(0),
      pricesIncludeGst: true,
      codAvailable: false,
      codUnavailableReason: null,
      codCharge: new Prisma.Decimal(0),
      codGrandTotal: null,
      coupon: null,
      couponError: null,
      hasStockIssues: false,
    };
  }

  async addItem(identity: CartIdentity, dto: AddToCartDto) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: dto.variantId, isActive: true, deletedAt: null },
      include: { inventory: true, product: { select: { status: true, deletedAt: true } } },
    });

    if (!variant || variant.product.status !== 'ACTIVE' || variant.product.deletedAt) {
      throw new NotFoundException('This product is not available');
    }

    const cart = await this.getOrCreateCart(identity);
    const existing = await this.prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId: cart.id, variantId: dto.variantId } },
    });

    const desiredQuantity = (existing?.quantity ?? 0) + dto.quantity;
    const available =
      (variant.inventory?.quantity ?? 0) - (variant.inventory?.reservedQuantity ?? 0);

    // Soft check only - the authoritative reservation happens at checkout.
    if (desiredQuantity > available) {
      throw new BadRequestException(
        available > 0
          ? `Only ${available} unit(s) of ${variant.sku} are available`
          : `${variant.sku} is out of stock`,
      );
    }
    if (desiredQuantity > 99) {
      throw new BadRequestException('Maximum 99 units per item');
    }

    await this.prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId: dto.variantId } },
      create: {
        cartId: cart.id,
        variantId: dto.variantId,
        quantity: dto.quantity,
        unitPriceSnapshot: variant.discountPrice ?? variant.price,
      },
      update: {
        quantity: desiredQuantity,
        unitPriceSnapshot: variant.discountPrice ?? variant.price,
      },
    });

    await this.touch(cart.id);
    return this.getCart(identity);
  }

  async updateItem(identity: CartIdentity, itemId: string, quantity: number) {
    const item = await this.findOwnedItem(identity, itemId);

    if (quantity === 0) {
      await this.prisma.cartItem.delete({ where: { id: itemId } });
      await this.touch(item.cartId);
      return this.getCart(identity);
    }

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: item.variantId },
      include: { inventory: true },
    });
    const available =
      (variant?.inventory?.quantity ?? 0) - (variant?.inventory?.reservedQuantity ?? 0);
    if (quantity > available) {
      throw new BadRequestException(`Only ${available} unit(s) available`);
    }

    await this.prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
    await this.touch(item.cartId);
    return this.getCart(identity);
  }

  async removeItem(identity: CartIdentity, itemId: string) {
    const item = await this.findOwnedItem(identity, itemId);
    await this.prisma.cartItem.delete({ where: { id: itemId } });
    await this.touch(item.cartId);
    return this.getCart(identity);
  }

  async clear(identity: CartIdentity) {
    const cart = await this.prisma.cart.findFirst({
      where: { ...this.identityWhere(identity), status: 'ACTIVE' },
    });
    if (cart) {
      await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
      await this.prisma.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
    }
    return this.getCart(identity);
  }

  /** Store the code; validity is re-evaluated on every cart read. */
  async applyCoupon(identity: CartIdentity, code: string) {
    const cart = await this.getOrCreateCart(identity);
    await this.prisma.cart.update({
      where: { id: cart.id },
      data: { couponCode: code.toUpperCase() },
    });

    const result = await this.getCart(identity);
    if (result.couponError) {
      // Do not persist a coupon that cannot be applied.
      await this.prisma.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
      throw new BadRequestException(result.couponError);
    }
    return result;
  }

  async removeCoupon(identity: CartIdentity) {
    const cart = await this.prisma.cart.findFirst({
      where: { ...this.identityWhere(identity), status: 'ACTIVE' },
    });
    if (cart) {
      await this.prisma.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
    }
    return this.getCart(identity);
  }

  /**
   * Fold a guest cart into the member cart at login. Quantities are summed and
   * clamped, so signing in never silently discards what the shopper picked.
   */
  async mergeGuestCart(userId: string, sessionId: string) {
    const guestCart = await this.prisma.cart.findFirst({
      where: { sessionId, status: 'ACTIVE' },
      include: { items: true },
    });
    if (!guestCart || guestCart.items.length === 0) {
      return this.getCart({ userId });
    }

    const userCart = await this.getOrCreateCart({ userId });

    await this.prisma.$transaction(async (tx) => {
      for (const item of guestCart.items) {
        const existing = await tx.cartItem.findUnique({
          where: { cartId_variantId: { cartId: userCart.id, variantId: item.variantId } },
        });
        await tx.cartItem.upsert({
          where: { cartId_variantId: { cartId: userCart.id, variantId: item.variantId } },
          create: {
            cartId: userCart.id,
            variantId: item.variantId,
            quantity: item.quantity,
            unitPriceSnapshot: item.unitPriceSnapshot,
          },
          update: { quantity: Math.min(99, (existing?.quantity ?? 0) + item.quantity) },
        });
      }
      if (guestCart.couponCode && !userCart.couponCode) {
        await tx.cart.update({
          where: { id: userCart.id },
          data: { couponCode: guestCart.couponCode },
        });
      }
      await tx.cart.delete({ where: { id: guestCart.id } });
    });

    return this.getCart({ userId });
  }

  private async findOwnedItem(identity: CartIdentity, itemId: string) {
    const item = await this.prisma.cartItem.findUnique({
      where: { id: itemId },
      include: { cart: true },
    });
    if (!item) throw new NotFoundException('Cart item not found');

    const owns = identity.userId
      ? item.cart.userId === identity.userId
      : item.cart.sessionId === identity.sessionId;
    if (!owns) throw new NotFoundException('Cart item not found');

    return item;
  }

  private async touch(cartId: string): Promise<void> {
    await this.prisma.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
  }
}
