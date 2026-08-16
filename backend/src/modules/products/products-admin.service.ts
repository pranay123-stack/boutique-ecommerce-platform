import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AttributeType, Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { classify } from '../tax/hsn-catalogue';
import { ProductsService } from './products.service';
import { paginate, skipOf, type PageParams } from '../../common/dto/pagination.dto';
import { toSlug } from '../../common/utils/slug.util';
import type { CreateProductDto, CreateVariantDto, UpdateProductDto } from './dto/product.dto';

/**
 * Catalogue write operations.
 *
 * Split from the read-side service because the two have opposite priorities:
 * reads are cached and latency-critical, writes are transactional and rare.
 */
@Injectable()
export class ProductsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
  ) {}

  async findAll(
    query: PageParams & { search?: string; status?: ProductStatus; categoryId?: string },
  ) {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { variants: { some: { sku: { contains: query.search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: skipOf(query),
        take: query.limit,
        include: {
          category: { select: { id: true, name: true } },
          images: { take: 1, orderBy: { position: 'asc' } },
          variants: {
            where: { deletedAt: null },
            select: {
              id: true,
              sku: true,
              name: true,
              price: true,
              discountPrice: true,
              isActive: true,
              inventory: {
                select: { quantity: true, reservedQuantity: true, lowStockThreshold: true },
              },
            },
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    const shaped = items.map((p) => ({
      ...p,
      totalStock: p.variants.reduce((s, v) => s + (v.inventory?.quantity ?? 0), 0),
      lowStock: p.variants.some(
        (v) => (v.inventory?.quantity ?? 0) <= (v.inventory?.lowStockThreshold ?? 0),
      ),
    }));
    return paginate(shaped, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: true,
        images: { orderBy: { position: 'asc' } },
        variants: {
          where: { deletedAt: null },
          orderBy: { position: 'asc' },
          include: {
            inventory: true,
            attributeValues: { include: { attributeValue: { include: { attribute: true } } } },
          },
        },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async create(dto: CreateProductDto) {
    this.assertUniqueSkus(dto.variants);
    this.assertVariantPricing(dto.variants);

    const category = await this.prisma.category.findFirst({
      where: { id: dto.categoryId, deletedAt: null },
    });
    if (!category) throw new BadRequestException('Category does not exist');

    const slug = await this.resolveSlug(dto.slug ?? dto.name);
    const classification = classify(category.slug, dto.basePrice);

    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name: dto.name,
          slug,
          description: dto.description ?? null,
          shortDescription: dto.shortDescription ?? null,
          categoryId: dto.categoryId,
          brand: dto.brand ?? null,
          basePrice: new Prisma.Decimal(dto.basePrice),
          compareAtPrice:
            dto.compareAtPrice !== undefined ? new Prisma.Decimal(dto.compareAtPrice) : null,
          // Classify from the category when the merchant has not said
          // otherwise, so a product added through the admin still carries a
          // usable HSN and rate rather than silently defaulting to the 18%
          // catch-all on its first tax invoice. What the merchant does supply
          // always wins.
          hsnCode: dto.hsnCode ?? classification.hsnCode,
          taxRatePercent: new Prisma.Decimal(dto.taxRatePercent ?? classification.gstRate),
          status: dto.status ?? ProductStatus.DRAFT,
          isFeatured: dto.isFeatured ?? false,
          isNewArrival: dto.isNewArrival ?? false,
          tags: dto.tags ?? [],
          seoTitle: dto.seoTitle ?? null,
          seoDescription: dto.seoDescription ?? null,
          publishedAt:
            (dto.status ?? ProductStatus.DRAFT) === ProductStatus.ACTIVE ? new Date() : null,
        },
      });

      const skuToVariantId = new Map<string, string>();
      for (const [index, variantDto] of dto.variants.entries()) {
        const variant = await this.createVariant(tx, created.id, variantDto, index);
        skuToVariantId.set(variantDto.sku, variant.id);
      }

      if (dto.images?.length) {
        await tx.productImage.createMany({
          data: dto.images.map((img, i) => ({
            productId: created.id,
            variantId: img.variantSku ? (skuToVariantId.get(img.variantSku) ?? null) : null,
            url: img.url,
            thumbnailUrl: img.thumbnailUrl ?? null,
            alt: img.alt ?? dto.name,
            position: img.position ?? i,
            isPrimary: img.isPrimary ?? i === 0,
          })),
        });
      }

      return created;
    });

    await this.products.invalidateCache();
    return this.findOne(product.id);
  }

  async update(id: string, dto: UpdateProductDto) {
    const existing = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, slug: true, status: true, publishedAt: true },
    });
    if (!existing) throw new NotFoundException('Product not found');

    if (dto.variants) {
      this.assertUniqueSkus(dto.variants);
      this.assertVariantPricing(dto.variants);
    }

    const slug =
      dto.slug && toSlug(dto.slug) !== existing.slug ? await this.resolveSlug(dto.slug) : undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(slug ? { slug } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.shortDescription !== undefined ? { shortDescription: dto.shortDescription } : {}),
          ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
          ...(dto.brand !== undefined ? { brand: dto.brand } : {}),
          ...(dto.basePrice !== undefined ? { basePrice: new Prisma.Decimal(dto.basePrice) } : {}),
          ...(dto.compareAtPrice !== undefined
            ? {
                compareAtPrice:
                  dto.compareAtPrice === null ? null : new Prisma.Decimal(dto.compareAtPrice),
              }
            : {}),
          ...(dto.taxRatePercent !== undefined
            ? { taxRatePercent: new Prisma.Decimal(dto.taxRatePercent) }
            : {}),
          ...(dto.hsnCode !== undefined ? { hsnCode: dto.hsnCode } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.isFeatured !== undefined ? { isFeatured: dto.isFeatured } : {}),
          ...(dto.isNewArrival !== undefined ? { isNewArrival: dto.isNewArrival } : {}),
          ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
          ...(dto.seoTitle !== undefined ? { seoTitle: dto.seoTitle } : {}),
          ...(dto.seoDescription !== undefined ? { seoDescription: dto.seoDescription } : {}),
          ...(dto.status === ProductStatus.ACTIVE && !existing.publishedAt
            ? { publishedAt: new Date() }
            : {}),
        },
      });

      // Images: replace the gallery when the payload provides one. Without
      // this the admin image uploader could add photos on create but never on
      // edit - the field was silently ignored by update().
      if (dto.images) {
        const skuToVariantId = new Map(
          (
            await tx.productVariant.findMany({
              where: { productId: id },
              select: { id: true, sku: true },
            })
          ).map((v) => [v.sku, v.id]),
        );
        await tx.productImage.deleteMany({ where: { productId: id } });
        if (dto.images.length) {
          await tx.productImage.createMany({
            data: dto.images.map((img, i) => ({
              productId: id,
              variantId: img.variantSku ? (skuToVariantId.get(img.variantSku) ?? null) : null,
              url: img.url,
              thumbnailUrl: img.thumbnailUrl ?? null,
              alt: img.alt ?? dto.name ?? null,
              position: img.position ?? i,
              isPrimary: img.isPrimary ?? i === 0,
            })),
          });
        }
      }

      if (dto.variants) {
        const current = await tx.productVariant.findMany({
          where: { productId: id, deletedAt: null },
          select: { id: true, sku: true },
        });
        const incomingSkus = new Set(dto.variants.map((v) => v.sku));
        const bySku = new Map(current.map((v) => [v.sku, v.id]));

        for (const [index, variantDto] of dto.variants.entries()) {
          const existingId = bySku.get(variantDto.sku);
          if (existingId) {
            await tx.productVariant.update({
              where: { id: existingId },
              data: {
                name: variantDto.name,
                price: new Prisma.Decimal(variantDto.price),
                discountPrice:
                  variantDto.discountPrice !== undefined
                    ? new Prisma.Decimal(variantDto.discountPrice)
                    : null,
                weightGrams: variantDto.weightGrams ?? 0,
                position: variantDto.position ?? index,
              },
            });
          } else {
            await this.createVariant(tx, id, variantDto, index);
          }
        }

        // Variants dropped from the payload are deactivated, never hard-deleted:
        // historical order items still point at them.
        const removed = current.filter((v) => !incomingSkus.has(v.sku));
        if (removed.length) {
          await tx.productVariant.updateMany({
            where: { id: { in: removed.map((v) => v.id) } },
            data: { isActive: false, deletedAt: new Date() },
          });
        }
      }
    });

    await this.products.invalidateCache(existing.slug);
    if (slug) await this.products.invalidateCache(slug);
    return this.findOne(id);
  }

  async remove(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, slug: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const openOrders = await this.prisma.orderItem.count({
      where: {
        productId: id,
        order: {
          status: { in: ['PENDING', 'PAYMENT_CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED'] },
        },
      },
    });
    if (openOrders > 0) {
      throw new BadRequestException(
        `This product appears on ${openOrders} order(s) still in flight. Archive it instead.`,
      );
    }

    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), status: ProductStatus.ARCHIVED },
    });
    await this.products.invalidateCache(product.slug);
    return { success: true, id };
  }

  // ---------------------------------------------------------------- helpers

  private async createVariant(
    tx: Prisma.TransactionClient,
    productId: string,
    dto: CreateVariantDto,
    index: number,
  ) {
    const variant = await tx.productVariant.create({
      data: {
        productId,
        sku: dto.sku,
        name: dto.name,
        price: new Prisma.Decimal(dto.price),
        discountPrice:
          dto.discountPrice !== undefined ? new Prisma.Decimal(dto.discountPrice) : null,
        costPrice: dto.costPrice !== undefined ? new Prisma.Decimal(dto.costPrice) : null,
        barcode: dto.barcode ?? null,
        weightGrams: dto.weightGrams ?? 0,
        position: dto.position ?? index,
        inventory: {
          create: {
            quantity: dto.stockQuantity,
            lowStockThreshold: dto.lowStockThreshold ?? 5,
          },
        },
      },
      include: { inventory: true },
    });

    // Record the opening balance so inventory history is complete from day one.
    if (variant.inventory && dto.stockQuantity > 0) {
      await tx.inventoryHistory.create({
        data: {
          inventoryId: variant.inventory.id,
          changeType: 'RESTOCK',
          quantityBefore: 0,
          quantityChange: dto.stockQuantity,
          quantityAfter: dto.stockQuantity,
          reason: 'Opening stock',
          referenceType: 'PRODUCT_CREATE',
          referenceId: productId,
        },
      });
    }

    for (const attr of dto.attributes ?? []) {
      const attributeValueId = await this.resolveAttributeValue(
        tx,
        attr.attributeName,
        attr.value,
        attr.hexColor,
      );
      await tx.variantAttributeValue.create({
        data: { variantId: variant.id, attributeValueId },
      });
    }

    return variant;
  }

  /** Find-or-create the attribute and its value, so admins can invent new axes freely. */
  private async resolveAttributeValue(
    tx: Prisma.TransactionClient,
    attributeName: string,
    value: string,
    hexColor?: string,
  ): Promise<string> {
    const typeMap: Record<string, AttributeType> = {
      size: AttributeType.SIZE,
      color: AttributeType.COLOR,
      colour: AttributeType.COLOR,
      material: AttributeType.MATERIAL,
    };
    const attribute = await tx.productAttribute.upsert({
      where: { name: attributeName },
      update: {},
      create: {
        name: attributeName,
        type: typeMap[attributeName.toLowerCase()] ?? AttributeType.OTHER,
      },
    });

    const slug = toSlug(`${attributeName}-${value}`);
    const attributeValue = await tx.productAttributeValue.upsert({
      where: { attributeId_slug: { attributeId: attribute.id, slug } },
      update: hexColor ? { hexColor } : {},
      create: { attributeId: attribute.id, value, slug, hexColor: hexColor ?? null },
    });
    return attributeValue.id;
  }

  private async resolveSlug(input: string): Promise<string> {
    const root = toSlug(input);
    const clashes = await this.prisma.product.findMany({
      where: { slug: { startsWith: root } },
      select: { slug: true },
    });
    const taken = new Set(clashes.map((c) => c.slug));
    if (!taken.has(root)) return root;
    let n = 2;
    while (taken.has(`${root}-${n}`)) n += 1;
    return `${root}-${n}`;
  }

  private assertUniqueSkus(variants: CreateVariantDto[]): void {
    const seen = new Set<string>();
    for (const v of variants) {
      if (seen.has(v.sku)) throw new BadRequestException(`Duplicate SKU in payload: ${v.sku}`);
      seen.add(v.sku);
    }
  }

  private assertVariantPricing(variants: CreateVariantDto[]): void {
    for (const v of variants) {
      if (v.discountPrice !== undefined && v.discountPrice > v.price) {
        throw new BadRequestException(
          `Variant ${v.sku}: discount price (${v.discountPrice}) cannot exceed price (${v.price})`,
        );
      }
    }
  }
}
