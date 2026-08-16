import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AddWishlistItemDto } from './dto/wishlist.dto';

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  private async getOrCreate(userId: string) {
    const existing = await this.prisma.wishlist.findUnique({ where: { userId } });
    return existing ?? this.prisma.wishlist.create({ data: { userId } });
  }

  async get(userId: string) {
    const wishlist = await this.getOrCreate(userId);
    const items = await this.prisma.wishlistItem.findMany({
      where: { wishlistId: wishlist.id },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            basePrice: true,
            compareAtPrice: true,
            status: true,
            ratingAverage: true,
            ratingCount: true,
            images: { where: { variantId: null }, take: 1, orderBy: { position: 'asc' } },
            variants: {
              where: { isActive: true, deletedAt: null },
              select: {
                id: true,
                price: true,
                discountPrice: true,
                inventory: { select: { quantity: true, reservedQuantity: true } },
              },
            },
          },
        },
        variant: { select: { id: true, sku: true, name: true, price: true, discountPrice: true } },
      },
    });

    return {
      id: wishlist.id,
      itemCount: items.length,
      items: items.map((item) => {
        const available = item.product.variants.reduce(
          (s, v) =>
            s + Math.max(0, (v.inventory?.quantity ?? 0) - (v.inventory?.reservedQuantity ?? 0)),
          0,
        );
        return {
          id: item.id,
          productId: item.productId,
          variantId: item.variantId,
          addedAt: item.createdAt,
          product: {
            ...item.product,
            variants: undefined,
            primaryImage: item.product.images[0]?.url ?? null,
            inStock: available > 0,
          },
          variant: item.variant,
        };
      }),
    };
  }

  async add(userId: string, dto: AddWishlistItemDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, deletedAt: null },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const wishlist = await this.getOrCreate(userId);

    // Idempotent add. Deliberately NOT an upsert on the compound unique:
    // Postgres treats NULLs as distinct in unique indexes, so a row with
    // variantId = NULL would not collide and the customer would accumulate
    // duplicate entries. An explicit lookup handles the null case correctly.
    const existing = await this.prisma.wishlistItem.findFirst({
      where: {
        wishlistId: wishlist.id,
        productId: dto.productId,
        variantId: dto.variantId ?? null,
      },
      select: { id: true },
    });

    if (!existing) {
      await this.prisma.wishlistItem.create({
        data: {
          wishlistId: wishlist.id,
          productId: dto.productId,
          variantId: dto.variantId ?? null,
        },
      });
    }
    return this.get(userId);
  }

  async remove(userId: string, itemId: string) {
    const wishlist = await this.getOrCreate(userId);
    const item = await this.prisma.wishlistItem.findFirst({
      where: { id: itemId, wishlistId: wishlist.id },
    });
    if (!item) throw new NotFoundException('Wishlist item not found');
    await this.prisma.wishlistItem.delete({ where: { id: itemId } });
    return this.get(userId);
  }

  async removeByProduct(userId: string, productId: string) {
    const wishlist = await this.getOrCreate(userId);
    await this.prisma.wishlistItem.deleteMany({ where: { wishlistId: wishlist.id, productId } });
    return this.get(userId);
  }
}
