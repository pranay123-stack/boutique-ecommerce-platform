import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InventoryChangeType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import { CACHE_KEYS } from '../../common/constants';
import { paginate, skipOf, type PageParams } from '../../common/dto/pagination.dto';
import type { AdjustStockDto, RestockDto } from './dto/inventory.dto';

export interface StockLine {
  variantId: string;
  quantity: number;
}

/**
 * Inventory control.
 *
 * The central problem here is oversell under concurrency: two shoppers racing
 * for the last unit must not both succeed. Every stock mutation is therefore a
 * single conditional UPDATE whose WHERE clause encodes the invariant. Postgres
 * takes a row lock for the duration, so the check and the write cannot be
 * separated by another transaction. Read-then-write in application code would
 * be a lost-update bug regardless of how tight the window looked.
 */
@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly cache: CacheService,
  ) {}

  /**
   * Reserve stock for an in-flight order. Reserved units remain in `quantity`
   * but are excluded from what the storefront can sell.
   */
  async reserve(
    lines: StockLine[],
    reference: { type: string; id: string },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;

    for (const line of lines) {
      const updated = await client.$executeRaw`
        UPDATE inventory
        SET "reservedQuantity" = "reservedQuantity" + ${line.quantity},
            "updatedAt" = NOW()
        WHERE "variantId" = ${line.variantId}
          AND quantity - "reservedQuantity" >= ${line.quantity}
      `;

      if (updated === 0) {
        const variant = await client.productVariant.findUnique({
          where: { id: line.variantId },
          select: {
            sku: true,
            name: true,
            inventory: { select: { quantity: true, reservedQuantity: true } },
          },
        });
        const available = Math.max(
          0,
          (variant?.inventory?.quantity ?? 0) - (variant?.inventory?.reservedQuantity ?? 0),
        );
        throw new BadRequestException(
          `Insufficient stock for ${variant?.sku ?? line.variantId}: requested ${line.quantity}, ${available} available`,
        );
      }

      await this.writeHistory(
        client,
        line.variantId,
        InventoryChangeType.RESERVATION,
        0,
        reference,
        'Reserved for order',
      );
    }
  }

  /** Release a reservation - order cancelled, payment failed, or checkout expired. */
  async release(
    lines: StockLine[],
    reference: { type: string; id: string },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    for (const line of lines) {
      // GREATEST guards against double-release driving the counter negative.
      await client.$executeRaw`
        UPDATE inventory
        SET "reservedQuantity" = GREATEST(0, "reservedQuantity" - ${line.quantity}),
            "updatedAt" = NOW()
        WHERE "variantId" = ${line.variantId}
      `;
      await this.writeHistory(
        client,
        line.variantId,
        InventoryChangeType.RELEASE,
        0,
        reference,
        'Reservation released',
      );
    }
  }

  /**
   * Convert a reservation into a sale: stock leaves the building. Called only
   * after payment is confirmed server-side.
   */
  async commit(
    lines: StockLine[],
    reference: { type: string; id: string },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    for (const line of lines) {
      const updated = await client.$executeRaw`
        UPDATE inventory
        SET quantity = quantity - ${line.quantity},
            "reservedQuantity" = GREATEST(0, "reservedQuantity" - ${line.quantity}),
            "updatedAt" = NOW()
        WHERE "variantId" = ${line.variantId}
          AND quantity >= ${line.quantity}
      `;
      if (updated === 0) {
        this.logger.error(
          `Stock commit failed for variant ${line.variantId} (qty ${line.quantity}) on ${reference.type}:${reference.id}`,
        );
        throw new BadRequestException('Stock could not be committed; please contact support');
      }
      await this.writeHistory(
        client,
        line.variantId,
        InventoryChangeType.SALE,
        -line.quantity,
        reference,
        'Sold',
      );
    }
    await this.checkLowStock(lines.map((l) => l.variantId));
    await this.invalidateProductCaches(lines.map((l) => l.variantId));
  }

  /** Return stock to inventory after a return or refund. */
  async returnStock(
    lines: StockLine[],
    reference: { type: string; id: string },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    for (const line of lines) {
      await client.$executeRaw`
        UPDATE inventory
        SET quantity = quantity + ${line.quantity}, "updatedAt" = NOW()
        WHERE "variantId" = ${line.variantId}
      `;
      await this.writeHistory(
        client,
        line.variantId,
        InventoryChangeType.RETURN,
        line.quantity,
        reference,
        'Returned to stock',
      );
    }
    await this.invalidateProductCaches(lines.map((l) => l.variantId));
  }

  // ------------------------------------------------------------------ admin

  async getStock(variantId: string) {
    const inventory = await this.prisma.inventory.findUnique({
      where: { variantId },
      include: {
        variant: {
          select: { sku: true, name: true, product: { select: { name: true, slug: true } } },
        },
      },
    });
    if (!inventory) throw new NotFoundException('Inventory record not found');
    return { ...inventory, available: inventory.quantity - inventory.reservedQuantity };
  }

  async adjust(variantId: string, dto: AdjustStockDto, userId?: string) {
    const inventory = await this.prisma.inventory.findUnique({ where: { variantId } });
    if (!inventory) throw new NotFoundException('Inventory record not found');

    if (dto.quantity < inventory.reservedQuantity) {
      throw new BadRequestException(
        `Cannot set quantity below the ${inventory.reservedQuantity} units currently reserved for open orders`,
      );
    }

    const change = dto.quantity - inventory.quantity;
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.inventory.update({
        where: { variantId },
        data: { quantity: dto.quantity },
      });
      await tx.inventoryHistory.create({
        data: {
          inventoryId: inventory.id,
          changeType: dto.changeType,
          quantityBefore: inventory.quantity,
          quantityChange: change,
          quantityAfter: dto.quantity,
          reason: dto.reason ?? null,
          referenceType: 'MANUAL_ADJUSTMENT',
          userId: userId ?? null,
        },
      });
      return result;
    });

    await this.checkLowStock([variantId]);
    await this.invalidateProductCaches([variantId]);
    return { ...updated, available: updated.quantity - updated.reservedQuantity };
  }

  async restock(variantId: string, dto: RestockDto, userId?: string) {
    const inventory = await this.prisma.inventory.findUnique({ where: { variantId } });
    if (!inventory) throw new NotFoundException('Inventory record not found');
    return this.adjust(
      variantId,
      {
        quantity: inventory.quantity + dto.quantity,
        changeType: InventoryChangeType.RESTOCK,
        reason: dto.reason ?? `Restocked ${dto.quantity} units`,
      },
      userId,
    );
  }

  async setThreshold(variantId: string, lowStockThreshold: number) {
    return this.prisma.inventory.update({ where: { variantId }, data: { lowStockThreshold } });
  }

  /** Variants at or below their reorder point - drives the admin alert panel. */
  async getLowStock(query: PageParams) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM inventory WHERE quantity <= "lowStockThreshold"
    `;
    const ids = rows.map((r) => r.id);
    const total = ids.length;

    const items = await this.prisma.inventory.findMany({
      where: { id: { in: ids } },
      orderBy: { quantity: 'asc' },
      skip: skipOf(query),
      take: query.limit,
      include: {
        variant: {
          select: {
            id: true,
            sku: true,
            name: true,
            product: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    return paginate(
      items.map((i) => ({ ...i, available: i.quantity - i.reservedQuantity })),
      total,
      query.page,
      query.limit,
    );
  }

  async getHistory(variantId: string, query: PageParams) {
    const inventory = await this.prisma.inventory.findUnique({
      where: { variantId },
      select: { id: true },
    });
    if (!inventory) throw new NotFoundException('Inventory record not found');

    const where = { inventoryId: inventory.id };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventoryHistory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: skipOf(query),
        take: query.limit,
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      }),
      this.prisma.inventoryHistory.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }

  // ---------------------------------------------------------------- helpers

  private async writeHistory(
    client: Prisma.TransactionClient | PrismaService,
    variantId: string,
    changeType: InventoryChangeType,
    quantityChange: number,
    reference: { type: string; id: string },
    reason: string,
  ): Promise<void> {
    const inventory = await client.inventory.findUnique({
      where: { variantId },
      select: { id: true, quantity: true },
    });
    if (!inventory) return;

    await client.inventoryHistory.create({
      data: {
        inventoryId: inventory.id,
        changeType,
        quantityBefore: inventory.quantity - quantityChange,
        quantityChange,
        quantityAfter: inventory.quantity,
        reason,
        referenceType: reference.type,
        referenceId: reference.id,
      },
    });
  }

  /**
   * Drop cached product payloads for the affected variants.
   *
   * Product detail and listing responses embed availability. Without this, a
   * sale that empties a variant keeps being advertised as in stock until the
   * TTL lapses, and customers add items that cannot actually be fulfilled.
   */
  private async invalidateProductCaches(variantIds: string[]): Promise<void> {
    if (!variantIds.length) return;
    try {
      const variants = await this.prisma.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: { product: { select: { slug: true } } },
      });
      const slugs = [...new Set(variants.map((v) => v.product.slug))];
      await this.cache.del(...slugs.map((slug) => CACHE_KEYS.productDetail(slug)));
      await this.cache.delPattern('products:list:*');
      await this.cache.del(CACHE_KEYS.homepage());
    } catch (err) {
      // Cache invalidation must never fail a completed stock movement.
      this.logger.warn(`Cache invalidation after stock change failed: ${(err as Error).message}`);
    }
  }

  /** Emit an alert when a sale drags a variant to or below its reorder point. */
  private async checkLowStock(variantIds: string[]): Promise<void> {
    const low = await this.prisma.$queryRaw<
      Array<{ variantId: string; quantity: number; lowStockThreshold: number }>
    >`
      SELECT "variantId", quantity, "lowStockThreshold"
      FROM inventory
      WHERE "variantId" = ANY(${variantIds}::text[]) AND quantity <= "lowStockThreshold"
    `;
    for (const row of low) {
      this.events.emit('inventory.low_stock', row);
      this.logger.warn(
        `Low stock: variant ${row.variantId} at ${row.quantity} (threshold ${row.lowStockThreshold})`,
      );
    }
  }
}
