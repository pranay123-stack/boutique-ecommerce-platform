import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import { CategoriesService } from '../categories/categories.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/constants';
import { paginate } from '../../common/dto/pagination.dto';
import { ProductSort, type QueryProductDto } from './dto/query-product.dto';

/** Shape returned for storefront listings - deliberately narrow to keep payloads small. */
const LIST_SELECT = {
  id: true,
  name: true,
  slug: true,
  shortDescription: true,
  brand: true,
  basePrice: true,
  compareAtPrice: true,
  currency: true,
  ratingAverage: true,
  ratingCount: true,
  totalSold: true,
  isFeatured: true,
  isNewArrival: true,
  createdAt: true,
  category: { select: { id: true, name: true, slug: true } },
  images: {
    where: { variantId: null },
    orderBy: { position: 'asc' as const },
    take: 2,
    select: { url: true, thumbnailUrl: true, alt: true, isPrimary: true },
  },
  variants: {
    where: { isActive: true, deletedAt: null },
    orderBy: { position: 'asc' as const },
    select: {
      id: true,
      sku: true,
      name: true,
      price: true,
      discountPrice: true,
      inventory: { select: { quantity: true, reservedQuantity: true } },
    },
  },
} satisfies Prisma.ProductSelect;

@Injectable()
export class ProductsService {
  /** Upper bound on the candidate set returned by a text search. */
  private static readonly SEARCH_CANDIDATE_LIMIT = 500;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly categories: CategoriesService,
  ) {}

  // ------------------------------------------------------------- storefront

  async findAll(query: QueryProductDto) {
    const cacheKey = CACHE_KEYS.productList(this.hashQuery(query));
    return this.cache.wrap(cacheKey, CACHE_TTL.PRODUCT_LIST, async () => {
      const where = await this.buildWhere(query);

      // Relevance ordering has to happen in Postgres (ts_rank), so a text
      // search resolves ranked ids first and then hydrates them.
      if (query.q && query.sort === ProductSort.RELEVANCE) {
        return this.findAllByRelevance(query, where);
      }

      const [items, total] = await this.prisma.$transaction([
        this.prisma.product.findMany({
          where,
          select: LIST_SELECT,
          orderBy: this.buildOrderBy(query.sort),
          skip: query.skip,
          take: query.limit,
        }),
        this.prisma.product.count({ where }),
      ]);

      return paginate(
        items.map((p) => this.decorate(p)),
        total,
        query.page,
        query.limit,
      );
    });
  }

  private async findAllByRelevance(query: QueryProductDto, where: Prisma.ProductWhereInput) {
    const ranked = await this.searchCandidates(query.q!);
    if (ranked.length === 0) return paginate([], 0, query.page, query.limit);

    const rank = new Map(ranked.map((r, i) => [r.id, i]));
    const matched = await this.prisma.product.findMany({
      where: { ...where, id: { in: ranked.map((r) => r.id) } },
      select: LIST_SELECT,
    });

    matched.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
    const page = matched.slice(query.skip, query.skip + query.limit);
    return paginate(
      page.map((p) => this.decorate(p)),
      matched.length,
      query.page,
      query.limit,
    );
  }

  /**
   * Ranked candidate ids for a text query.
   *
   * Combines weighted full-text matching with trigram similarity so that
   * misspellings ("scrf") still resolve. Bounded to keep worst-case cost flat
   * regardless of catalogue size.
   */
  private async searchCandidates(q: string): Promise<Array<{ id: string }>> {
    // `word_similarity` compares the query against the best-matching *window*
    // inside the product name, unlike `similarity` which compares whole
    // strings - "scrf" scores 0.09 against "Hand-Rolled Mulberry Silk Scarf"
    // whole-string, but 0.40 word-wise. The default threshold of 0.6 is too
    // strict for real typos, so we lower it for this statement only.
    // SET LOCAL keeps the change scoped to the transaction; the `<%` operator
    // stays index-accelerated by products_name_trgm.
    const [, rows] = await this.prisma.$transaction([
      this.prisma.$executeRaw`SET LOCAL pg_trgm.word_similarity_threshold = 0.35`,
      this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM products
        WHERE status = 'ACTIVE'
          AND "deletedAt" IS NULL
          AND (
            "searchVector" @@ plainto_tsquery('english', ${q})
            OR ${q} <% name
            OR name ILIKE ${'%' + q + '%'}
          )
        ORDER BY
          ts_rank("searchVector", plainto_tsquery('english', ${q})) DESC,
          word_similarity(${q}, name) DESC,
          "totalSold" DESC
        LIMIT ${ProductsService.SEARCH_CANDIDATE_LIMIT}
      `,
    ]);
    return rows as Array<{ id: string }>;
  }

  async findBySlug(slug: string) {
    const cached = await this.cache.get<unknown>(CACHE_KEYS.productDetail(slug));
    if (cached) return cached;

    const product = await this.prisma.product.findFirst({
      where: { slug, status: ProductStatus.ACTIVE, deletedAt: null },
      include: {
        category: { select: { id: true, name: true, slug: true, parentId: true } },
        images: { orderBy: { position: 'asc' } },
        variants: {
          where: { isActive: true, deletedAt: null },
          orderBy: { position: 'asc' },
          include: {
            inventory: true,
            images: { orderBy: { position: 'asc' } },
            attributeValues: {
              include: { attributeValue: { include: { attribute: true } } },
            },
          },
        },
        reviews: {
          where: { status: 'APPROVED' },
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    if (!product) throw new NotFoundException(`Product "${slug}" was not found`);

    const shaped = {
      ...product,
      variants: product.variants.map((v) => ({
        ...v,
        available: Math.max(0, (v.inventory?.quantity ?? 0) - (v.inventory?.reservedQuantity ?? 0)),
        inStock: (v.inventory?.quantity ?? 0) - (v.inventory?.reservedQuantity ?? 0) > 0,
        attributes: v.attributeValues.map((av) => ({
          name: av.attributeValue.attribute.name,
          type: av.attributeValue.attribute.type,
          value: av.attributeValue.value,
          slug: av.attributeValue.slug,
          hexColor: av.attributeValue.hexColor,
        })),
        attributeValues: undefined,
      })),
      // Option matrix drives the variant picker in the UI.
      options: this.buildOptionMatrix(product.variants),
    };

    await this.cache.set(CACHE_KEYS.productDetail(slug), shaped, CACHE_TTL.PRODUCT_DETAIL);
    return shaped;
  }

  private buildOptionMatrix(
    variants: Array<{
      attributeValues: Array<{
        attributeValue: {
          value: string;
          slug: string;
          hexColor: string | null;
          attribute: { name: string; type: string };
        };
      }>;
    }>,
  ) {
    const options = new Map<
      string,
      {
        name: string;
        type: string;
        values: Map<string, { value: string; slug: string; hexColor: string | null }>;
      }
    >();
    for (const variant of variants) {
      for (const { attributeValue } of variant.attributeValues) {
        const key = attributeValue.attribute.name;
        if (!options.has(key)) {
          options.set(key, { name: key, type: attributeValue.attribute.type, values: new Map() });
        }
        options.get(key)!.values.set(attributeValue.slug, {
          value: attributeValue.value,
          slug: attributeValue.slug,
          hexColor: attributeValue.hexColor,
        });
      }
    }
    return [...options.values()].map((o) => ({
      name: o.name,
      type: o.type,
      values: [...o.values.values()],
    }));
  }

  /** Same-category products, most popular first. Cheap "you may also like". */
  async findRelated(slug: string, limit = 8) {
    const product = await this.prisma.product.findFirst({
      where: { slug, deletedAt: null },
      select: { id: true, categoryId: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const items = await this.prisma.product.findMany({
      where: {
        categoryId: product.categoryId,
        id: { not: product.id },
        status: ProductStatus.ACTIVE,
        deletedAt: null,
      },
      select: LIST_SELECT,
      orderBy: [{ totalSold: 'desc' }, { ratingAverage: 'desc' }],
      take: limit,
    });
    return items.map((p) => this.decorate(p));
  }

  /**
   * Facet counts for the filter sidebar.
   *
   * Computed with aggregates in Postgres rather than by loading rows into Node.
   * The original implementation selected every matching product and passed the
   * resulting id array into the attribute query - at 100k products that meant
   * materialising 100k ids per request and a ~650ms response. Aggregating in
   * the database keeps this flat as the catalogue grows.
   *
   * The brand and attribute facets are computed with those same facets removed
   * from the filter, so selecting one colour does not zero out every other
   * colour.
   */
  async getFacets(query: QueryProductDto) {
    const cacheKey = `products:facets:${this.hashQuery({
      ...query,
      page: 1,
      limit: 0,
      brands: undefined,
      attributes: undefined,
    } as QueryProductDto)}`;

    return this.cache.wrap(cacheKey, CACHE_TTL.FACETS, async () => {
      const where = await this.buildWhere({ ...query, brands: undefined, attributes: undefined });

      const [brandGroups, priceStats, matchCount] = await Promise.all([
        this.prisma.product.groupBy({
          by: ['brand'],
          where,
          _count: { _all: true },
          orderBy: { _count: { brand: 'desc' } },
        }),
        this.prisma.product.aggregate({
          where,
          _min: { basePrice: true },
          _max: { basePrice: true },
        }),
        this.prisma.product.count({ where }),
      ]);

      if (matchCount === 0) {
        return { brands: [], attributes: [], priceRange: { min: 0, max: 0 } };
      }

      const attributeRows = await this.attributeFacets(query, where);

      const grouped = new Map<
        string,
        Array<{ value: string; slug: string; hexColor: string | null; count: number }>
      >();
      for (const row of attributeRows) {
        if (!grouped.has(row.attribute)) grouped.set(row.attribute, []);
        grouped.get(row.attribute)!.push({
          value: row.value,
          slug: row.slug,
          hexColor: row.hexColor,
          count: Number(row.count),
        });
      }

      return {
        brands: brandGroups
          .filter((b) => b.brand !== null)
          .map((b) => ({ name: b.brand as string, count: b._count._all })),
        attributes: [...grouped.entries()].map(([name, values]) => ({ name, values })),
        priceRange: {
          min: Math.floor(Number(priceStats._min.basePrice ?? 0)),
          max: Math.ceil(Number(priceStats._max.basePrice ?? 0)),
        },
      };
    });
  }

  /**
   * Attribute facet counts.
   *
   * Joins straight from the attribute tables to products and re-applies the
   * predicates in SQL, so no id list ever crosses the process boundary. A text
   * search is the one case that still needs an id set, and that is already
   * capped at SEARCH_CANDIDATE_LIMIT.
   */
  private async attributeFacets(
    query: QueryProductDto,
    where: Prisma.ProductWhereInput,
  ): Promise<
    Array<{
      attribute: string;
      value: string;
      slug: string;
      hexColor: string | null;
      count: bigint;
    }>
  > {
    const categoryFilter = (where.categoryId as { in?: string[] } | undefined)?.in;
    const priceFilter = where.basePrice as { gte?: number; lte?: number } | undefined;
    const searchIds = (where.id as { in?: string[] } | undefined)?.in;

    const conditions: Prisma.Sql[] = [
      Prisma.sql`p.status = 'ACTIVE'`,
      Prisma.sql`p."deletedAt" IS NULL`,
      Prisma.sql`pv."isActive" = true`,
      Prisma.sql`pv."deletedAt" IS NULL`,
    ];
    if (categoryFilter?.length) {
      conditions.push(Prisma.sql`p."categoryId" = ANY(${categoryFilter}::text[])`);
    }
    if (searchIds) {
      conditions.push(Prisma.sql`p.id = ANY(${searchIds}::text[])`);
    }
    if (priceFilter?.gte !== undefined) {
      conditions.push(Prisma.sql`p."basePrice" >= ${priceFilter.gte}`);
    }
    if (priceFilter?.lte !== undefined) {
      conditions.push(Prisma.sql`p."basePrice" <= ${priceFilter.lte}`);
    }
    if (query.featured) conditions.push(Prisma.sql`p."isFeatured" = true`);
    if (query.newArrivals) conditions.push(Prisma.sql`p."isNewArrival" = true`);

    return this.prisma.$queryRaw`
      SELECT pa.name AS attribute, pav.value, pav.slug, pav."hexColor",
             COUNT(DISTINCT pv."productId") AS count
      FROM variant_attribute_values vav
      JOIN product_variants pv        ON pv.id = vav."variantId"
      JOIN products p                 ON p.id = pv."productId"
      JOIN product_attribute_values pav ON pav.id = vav."attributeValueId"
      JOIN product_attributes pa      ON pa.id = pav."attributeId"
      WHERE ${Prisma.join(conditions, ' AND ')}
      GROUP BY pa.name, pav.value, pav.slug, pav."hexColor", pa.position, pav.position
      ORDER BY pa.position, pav.position
    `;
  }

  // ---------------------------------------------------------------- helpers

  private async buildWhere(
    query: Omit<QueryProductDto, 'skip'>,
  ): Promise<Prisma.ProductWhereInput> {
    const where: Prisma.ProductWhereInput = {
      status: ProductStatus.ACTIVE,
      deletedAt: null,
    };

    if (query.category) {
      const category = await this.prisma.category.findFirst({
        where: { slug: query.category, deletedAt: null },
        select: { id: true },
      });
      if (!category) throw new NotFoundException(`Category "${query.category}" was not found`);
      // Include the whole branch so /category/women returns everything beneath it.
      const ids = await this.categories.getDescendantIds(category.id);
      where.categoryId = { in: ids };
    }

    if (query.q && query.sort !== ProductSort.RELEVANCE) {
      const candidates = await this.searchCandidates(query.q);
      where.id = { in: candidates.map((c) => c.id) };
    }

    if (query.brands?.length) where.brand = { in: query.brands };
    if (query.tags?.length) where.tags = { hasSome: query.tags };
    if (query.featured) where.isFeatured = true;
    if (query.newArrivals) where.isNewArrival = true;
    if (query.minRating) where.ratingAverage = { gte: query.minRating };

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.basePrice = {
        ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
        ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
      };
    }

    // Attribute and stock filters both constrain the variant collection.
    const variantConditions: Prisma.ProductVariantWhereInput = { isActive: true, deletedAt: null };
    let needsVariantFilter = false;

    if (query.attributes?.length) {
      variantConditions.attributeValues = {
        some: { attributeValue: { slug: { in: query.attributes } } },
      };
      needsVariantFilter = true;
    }
    if (query.inStock) {
      variantConditions.inventory = { is: { quantity: { gt: 0 } } };
      needsVariantFilter = true;
    }
    if (needsVariantFilter) where.variants = { some: variantConditions };

    return where;
  }

  private buildOrderBy(sort?: ProductSort): Prisma.ProductOrderByWithRelationInput[] {
    switch (sort) {
      case ProductSort.PRICE_ASC:
        return [{ basePrice: 'asc' }, { id: 'asc' }];
      case ProductSort.PRICE_DESC:
        return [{ basePrice: 'desc' }, { id: 'asc' }];
      case ProductSort.BEST_SELLING:
        return [{ totalSold: 'desc' }, { id: 'asc' }];
      case ProductSort.RATING:
        return [{ ratingAverage: 'desc' }, { ratingCount: 'desc' }, { id: 'asc' }];
      case ProductSort.NAME_ASC:
        return [{ name: 'asc' }, { id: 'asc' }];
      case ProductSort.NEWEST:
      default:
        // `id` is the tiebreaker so pagination is stable when timestamps collide.
        return [{ createdAt: 'desc' }, { id: 'asc' }];
    }
  }

  /** Add derived commercial fields the storefront needs on every card. */
  private decorate(product: any) {
    const variants = product.variants ?? [];
    const prices: number[] = variants.map((v: any) => Number(v.discountPrice ?? v.price));
    const available = variants.reduce(
      (sum: number, v: any) =>
        sum + Math.max(0, (v.inventory?.quantity ?? 0) - (v.inventory?.reservedQuantity ?? 0)),
      0,
    );
    const effectivePrice = prices.length ? Math.min(...prices) : Number(product.basePrice);
    const compareAt = product.compareAtPrice ? Number(product.compareAtPrice) : null;

    return {
      ...product,
      variants: variants.map((v: any) => ({
        ...v,
        available: Math.max(0, (v.inventory?.quantity ?? 0) - (v.inventory?.reservedQuantity ?? 0)),
        inventory: undefined,
      })),
      effectivePrice,
      priceFrom: prices.length ? Math.min(...prices) : Number(product.basePrice),
      priceTo: prices.length ? Math.max(...prices) : Number(product.basePrice),
      discountPercent:
        compareAt && compareAt > effectivePrice
          ? Math.round(((compareAt - effectivePrice) / compareAt) * 100)
          : 0,
      inStock: available > 0,
      totalAvailable: available,
      primaryImage:
        product.images?.find((i: any) => i.isPrimary)?.url ?? product.images?.[0]?.url ?? null,
    };
  }

  private hashQuery(query: QueryProductDto): string {
    return createHash('sha1').update(JSON.stringify(query)).digest('hex').slice(0, 24);
  }

  async invalidateCache(slug?: string): Promise<void> {
    await this.cache.delPattern('products:list:*');
    await this.cache.delPattern('products:facets:*');
    await this.cache.del(CACHE_KEYS.homepage());
    if (slug) await this.cache.del(CACHE_KEYS.productDetail(slug));
  }
}
