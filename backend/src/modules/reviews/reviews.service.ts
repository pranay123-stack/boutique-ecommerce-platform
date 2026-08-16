import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReviewStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import { CACHE_KEYS } from '../../common/constants';
import { paginate, skipOf, type PageParams } from '../../common/dto/pagination.dto';
import type { CreateReviewDto } from './dto/review.dto';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async findForProduct(productId: string, query: PageParams) {
    const where = { productId, status: ReviewStatus.APPROVED };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        orderBy: [{ helpfulCount: 'desc' }, { createdAt: 'desc' }],
        skip: skipOf(query),
        take: query.limit,
        include: { user: { select: { firstName: true, lastName: true } } },
      }),
      this.prisma.review.count({ where }),
    ]);

    // Kept out of the $transaction tuple above: Prisma's aggregate typing does
    // not survive the tuple inference and degrades to a union.
    const breakdown = await this.prisma.review.groupBy({
      by: ['rating'],
      where,
      _count: { _all: true },
      orderBy: { rating: 'asc' },
    });

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of breakdown) distribution[row.rating] = row._count._all;

    return {
      ...paginate(
        items.map((r) => ({
          ...r,
          // Surname is reduced to an initial - reviews are public.
          author: `${r.user.firstName}${r.user.lastName ? ` ${r.user.lastName[0]}.` : ''}`,
          user: undefined,
        })),
        total,
        query.page,
        query.limit,
      ),
      distribution,
    };
  }

  /**
   * Create a review.
   *
   * Only customers who actually received the product may review it, which is
   * what keeps ratings meaningful. The matching order item is recorded so the
   * storefront can badge the review as a verified purchase.
   */
  async create(userId: string, dto: CreateReviewDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, deletedAt: null },
      select: { id: true, slug: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const existing = await this.prisma.review.findUnique({
      where: { productId_userId: { productId: dto.productId, userId } },
    });
    if (existing) throw new BadRequestException('You have already reviewed this product');

    const purchase = await this.prisma.orderItem.findFirst({
      where: {
        productId: dto.productId,
        order: { userId, status: { in: ['DELIVERED', 'SHIPPED'] } },
      },
      select: { id: true },
    });
    if (!purchase) {
      throw new BadRequestException('You can only review products from a delivered order');
    }

    const review = await this.prisma.review.create({
      data: {
        productId: dto.productId,
        userId,
        orderItemId: purchase.id,
        rating: dto.rating,
        title: dto.title ?? null,
        comment: dto.comment ?? null,
        // Held for moderation - published reviews are a brand surface.
        status: ReviewStatus.PENDING,
      },
    });

    await this.recalculateRating(dto.productId, product.slug);
    return review;
  }

  async findMine(userId: string, query: PageParams) {
    const where = { userId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: skipOf(query),
        take: query.limit,
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              images: { take: 1, where: { variantId: null }, orderBy: { position: 'asc' } },
            },
          },
        },
      }),
      this.prisma.review.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }

  // ------------------------------------------------------------ moderation

  async findAllAdmin(query: PageParams & { status?: ReviewStatus }) {
    const where = query.status ? { status: query.status } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: skipOf(query),
        take: query.limit,
        include: {
          product: { select: { id: true, name: true, slug: true } },
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.review.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }

  async setStatus(id: string, status: ReviewStatus) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: { product: { select: { slug: true } } },
    });
    if (!review) throw new NotFoundException('Review not found');

    const updated = await this.prisma.review.update({ where: { id }, data: { status } });
    await this.recalculateRating(review.productId, review.product.slug);
    return updated;
  }

  async remove(id: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: { product: { select: { slug: true } } },
    });
    if (!review) throw new NotFoundException('Review not found');
    await this.prisma.review.delete({ where: { id } });
    await this.recalculateRating(review.productId, review.product.slug);
    return { success: true };
  }

  /**
   * Recompute the denormalised rating on the product.
   *
   * Aggregating over reviews on every product read would be far more expensive
   * than recomputing here, where reviews change rarely.
   */
  private async recalculateRating(productId: string, slug: string): Promise<void> {
    const stats = await this.prisma.review.aggregate({
      where: { productId, status: ReviewStatus.APPROVED },
      _avg: { rating: true },
      _count: true,
    });

    await this.prisma.product.update({
      where: { id: productId },
      data: {
        ratingAverage: new Prisma.Decimal((stats._avg.rating ?? 0).toFixed(2)),
        ratingCount: stats._count,
      },
    });

    await this.cache.del(CACHE_KEYS.productDetail(slug));
    await this.cache.delPattern('products:list:*');
  }
}
