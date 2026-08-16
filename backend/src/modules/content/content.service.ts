import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BannerPlacement, ProductStatus } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/constants';
import type { CreateBannerDto, UpdateBannerDto } from './dto/banner.dto';

/** Attribution for one stock photograph, as written by the seed. */
export interface ImageCredit {
  source: 'unsplash' | 'pexels';
  photographer: string;
  photographerUrl: string;
  sourceUrl: string;
}

/**
 * Merchandising surface: banners, promotions and the assembled homepage.
 */
@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);
  /**
   * Parsed sidecar, re-read after CREDITS_TTL_MS.
   *
   * Not cached indefinitely: an API process that starts before the catalogue
   * is seeded reads no file, and caching that empty result for the life of the
   * process meant it served "nothing to credit" forever - photographers went
   * uncredited until someone happened to restart the container. A minute of
   * staleness on a file that changes only when the seed runs is the right
   * trade.
   */
  private creditsCache: { value: Record<string, ImageCredit>; readAt: number } | null = null;
  private static readonly CREDITS_TTL_MS = 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Photographer attribution for the demo imagery.
   *
   * Read from `uploads/image-credits.json`, which the seed writes when it
   * downloads stock photography. Both Unsplash and Pexels require the
   * photographer to be credited wherever their work appears, and this is what
   * the storefront renders those credits from.
   *
   * An absent file is the normal, expected state once the merchant's own
   * photographs replace the placeholders - it means there is nothing to
   * credit, not that something is broken.
   */
  async imageCredits(): Promise<Record<string, ImageCredit>> {
    const fresh =
      this.creditsCache && Date.now() - this.creditsCache.readAt < ContentService.CREDITS_TTL_MS;
    if (fresh) return this.creditsCache!.value;

    const root = resolve(this.config.get<string>('storage.localPath') ?? './uploads');
    let value: Record<string, ImageCredit> = {};
    try {
      const raw = await readFile(join(root, 'image-credits.json'), 'utf8');
      value = (JSON.parse(raw) as { credits?: Record<string, ImageCredit> }).credits ?? {};
    } catch {
      // No sidecar is the normal state once real photography replaces the
      // placeholders - nothing to credit, not a failure.
      value = {};
    }
    this.creditsCache = { value, readAt: Date.now() };
    return value;
  }

  /**
   * One request that returns everything above and below the fold.
   *
   * The homepage previously needed six round-trips; batching them into a single
   * cached payload is the difference between a fast first paint and a waterfall.
   */
  async getHomepage() {
    return this.cache.wrap(CACHE_KEYS.homepage(), CACHE_TTL.HOMEPAGE, async () => {
      const now = new Date();
      const liveBannerWhere = {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      };

      const productCard = {
        id: true,
        name: true,
        slug: true,
        basePrice: true,
        compareAtPrice: true,
        ratingAverage: true,
        ratingCount: true,
        isFeatured: true,
        isNewArrival: true,
        brand: true,
        images: { where: { variantId: null }, take: 1, orderBy: { position: 'asc' as const } },
        variants: {
          where: { isActive: true, deletedAt: null },
          select: {
            price: true,
            discountPrice: true,
            inventory: { select: { quantity: true, reservedQuantity: true } },
          },
        },
      };

      const liveProduct = { status: ProductStatus.ACTIVE, deletedAt: null };

      const [heroBanners, promoBanners, featured, newArrivals, bestSellers, categories] =
        await Promise.all([
          this.prisma.banner.findMany({
            where: { ...liveBannerWhere, placement: BannerPlacement.HOME_HERO },
            orderBy: { position: 'asc' },
          }),
          this.prisma.banner.findMany({
            where: { ...liveBannerWhere, placement: BannerPlacement.HOME_PROMO },
            orderBy: { position: 'asc' },
          }),
          this.prisma.product.findMany({
            where: { ...liveProduct, isFeatured: true },
            select: productCard,
            orderBy: { updatedAt: 'desc' },
            take: 8,
          }),
          this.prisma.product.findMany({
            where: { ...liveProduct, isNewArrival: true },
            select: productCard,
            orderBy: { createdAt: 'desc' },
            take: 8,
          }),
          this.prisma.product.findMany({
            where: { ...liveProduct, totalSold: { gt: 0 } },
            select: productCard,
            orderBy: { totalSold: 'desc' },
            take: 8,
          }),
          this.prisma.category.findMany({
            where: { isActive: true, deletedAt: null, parentId: null },
            orderBy: { position: 'asc' },
            take: 8,
            select: { id: true, name: true, slug: true, imageUrl: true },
          }),
        ]);

      const decorate = (products: typeof featured) =>
        products.map((p) => {
          const prices = p.variants.map((v) => Number(v.discountPrice ?? v.price));
          const effectivePrice = prices.length ? Math.min(...prices) : Number(p.basePrice);
          const compareAt = p.compareAtPrice ? Number(p.compareAtPrice) : null;
          const available = p.variants.reduce(
            (s, v) =>
              s + Math.max(0, (v.inventory?.quantity ?? 0) - (v.inventory?.reservedQuantity ?? 0)),
            0,
          );
          return {
            ...p,
            variants: undefined,
            primaryImage: p.images[0]?.url ?? null,
            effectivePrice,
            discountPercent:
              compareAt && compareAt > effectivePrice
                ? Math.round(((compareAt - effectivePrice) / compareAt) * 100)
                : 0,
            inStock: available > 0,
          };
        });

      return {
        heroBanners,
        promoBanners,
        featured: decorate(featured),
        newArrivals: decorate(newArrivals),
        bestSellers: decorate(bestSellers),
        categories,
      };
    });
  }

  // ------------------------------------------------------------- banners

  async findAllBanners(placement?: BannerPlacement) {
    return this.prisma.banner.findMany({
      where: placement ? { placement } : {},
      orderBy: [{ placement: 'asc' }, { position: 'asc' }],
    });
  }

  async createBanner(dto: CreateBannerDto) {
    const banner = await this.prisma.banner.create({
      data: {
        ...dto,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      },
    });
    await this.cache.del(CACHE_KEYS.homepage());
    return banner;
  }

  async updateBanner(id: string, dto: UpdateBannerDto) {
    const existing = await this.prisma.banner.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Banner not found');

    const banner = await this.prisma.banner.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.startsAt !== undefined
          ? { startsAt: dto.startsAt ? new Date(dto.startsAt) : null }
          : {}),
        ...(dto.endsAt !== undefined ? { endsAt: dto.endsAt ? new Date(dto.endsAt) : null } : {}),
      },
    });
    await this.cache.del(CACHE_KEYS.homepage());
    return banner;
  }

  async deleteBanner(id: string) {
    await this.prisma.banner.delete({ where: { id } });
    await this.cache.del(CACHE_KEYS.homepage());
    return { success: true };
  }

  /** Bulk-set which products are featured on the homepage. */
  async setFeaturedProducts(productIds: string[]) {
    await this.prisma.$transaction([
      this.prisma.product.updateMany({ where: { isFeatured: true }, data: { isFeatured: false } }),
      this.prisma.product.updateMany({
        where: { id: { in: productIds } },
        data: { isFeatured: true },
      }),
    ]);
    await this.cache.del(CACHE_KEYS.homepage());
    await this.cache.delPattern('products:*');
    return { success: true, count: productIds.length };
  }

  // ------------------------------------------------------------ settings

  async getSetting(key: string) {
    const setting = await this.prisma.setting.findUnique({ where: { key } });
    return setting?.value ?? null;
  }

  async setSetting(key: string, value: unknown) {
    return this.prisma.setting.upsert({
      where: { key },
      create: { key, value: value as never },
      update: { value: value as never },
    });
  }

  async getAllSettings() {
    const rows = await this.prisma.setting.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }
}
