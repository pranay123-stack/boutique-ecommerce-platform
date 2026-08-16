import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/constants';
import { toSlug } from '../../common/utils/slug.util';
import type { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  position: number;
  productCount: number;
  children: CategoryNode[];
}

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Full category tree with product counts.
   *
   * Built with a single flat query then assembled in memory - a recursive CTE
   * per request would be far more expensive, and the tree is small and cached.
   */
  async getTree(): Promise<CategoryNode[]> {
    return this.cache.wrap(CACHE_KEYS.categoryTree(), CACHE_TTL.CATEGORY_TREE, async () => {
      const categories = await this.prisma.category.findMany({
        where: { isActive: true, deletedAt: null },
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        include: {
          _count: { select: { products: { where: { status: 'ACTIVE', deletedAt: null } } } },
        },
      });

      const nodes = new Map<string, CategoryNode>();
      for (const c of categories) {
        nodes.set(c.id, {
          id: c.id,
          name: c.name,
          slug: c.slug,
          description: c.description,
          imageUrl: c.imageUrl,
          position: c.position,
          productCount: c._count.products,
          children: [],
        });
      }

      const roots: CategoryNode[] = [];
      for (const c of categories) {
        const node = nodes.get(c.id)!;
        const parent = c.parentId ? nodes.get(c.parentId) : undefined;
        if (parent) parent.children.push(node);
        else roots.push(node);
      }

      // A parent's count should include everything beneath it.
      const rollUp = (node: CategoryNode): number => {
        const childTotal = node.children.reduce((sum, child) => sum + rollUp(child), 0);
        node.productCount += childTotal;
        return node.productCount;
      };
      roots.forEach(rollUp);

      return roots;
    });
  }

  async findAllFlat() {
    return this.prisma.category.findMany({
      where: { deletedAt: null },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        _count: { select: { products: true } },
      },
    });
  }

  async findBySlug(slug: string) {
    const category = await this.prisma.category.findFirst({
      where: { slug, deletedAt: null },
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        children: {
          where: { isActive: true, deletedAt: null },
          orderBy: { position: 'asc' },
          select: { id: true, name: true, slug: true, imageUrl: true },
        },
      },
    });
    if (!category) throw new NotFoundException(`Category "${slug}" was not found`);
    return category;
  }

  async findById(id: string) {
    const category = await this.prisma.category.findFirst({ where: { id, deletedAt: null } });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  /** All descendant ids including the root - used to filter products by branch. */
  async getDescendantIds(categoryId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE tree AS (
        SELECT id FROM categories WHERE id = ${categoryId} AND "deletedAt" IS NULL
        UNION ALL
        SELECT c.id FROM categories c
        INNER JOIN tree t ON c."parentId" = t.id
        WHERE c."deletedAt" IS NULL
      )
      SELECT id FROM tree
    `;
    return rows.map((r) => r.id);
  }

  async create(dto: CreateCategoryDto) {
    const slug = dto.slug ? toSlug(dto.slug) : toSlug(dto.name);

    if (dto.parentId) {
      const parent = await this.prisma.category.findFirst({
        where: { id: dto.parentId, deletedAt: null },
      });
      if (!parent) throw new BadRequestException('Parent category does not exist');
    }

    const category = await this.prisma.category.create({
      data: { ...dto, slug },
    });
    await this.invalidate();
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findById(id);

    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new BadRequestException('A category cannot be its own parent');
      }
      // Re-parenting under one's own descendant would create an orphaned cycle.
      const descendants = await this.getDescendantIds(id);
      if (descendants.includes(dto.parentId)) {
        throw new BadRequestException('Cannot move a category beneath its own descendant');
      }
    }

    const category = await this.prisma.category.update({
      where: { id },
      data: { ...dto, ...(dto.slug ? { slug: toSlug(dto.slug) } : {}) },
    });
    await this.invalidate();
    return category;
  }

  async remove(id: string) {
    const productCount = await this.prisma.product.count({
      where: { categoryId: id, deletedAt: null },
    });
    if (productCount > 0) {
      throw new BadRequestException(
        `Cannot delete a category that still holds ${productCount} product(s). ` +
          'Move or archive them first.',
      );
    }
    const childCount = await this.prisma.category.count({
      where: { parentId: id, deletedAt: null },
    });
    if (childCount > 0) {
      throw new BadRequestException('Cannot delete a category that has subcategories');
    }

    // Soft delete: historical orders may still reference this branch.
    const category = await this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.invalidate();
    return category;
  }

  private async invalidate(): Promise<void> {
    await this.cache.del(CACHE_KEYS.categoryTree());
    await this.cache.delPattern('products:*');
  }
}
