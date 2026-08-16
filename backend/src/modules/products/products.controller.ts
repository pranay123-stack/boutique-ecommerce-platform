import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { ProductsAdminService } from './products-admin.service';
import { QueryProductDto } from './dto/query-product.dto';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { AdminProductQueryDto } from '../../common/dto/admin-query.dto';
import { Audit, Public, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/constants';

@ApiTags('Catalog')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Search, filter, sort and paginate the catalogue',
    description:
      'Supports full-text + fuzzy search (`q`), category branch filtering, price ranges, ' +
      'brand/attribute/tag facets, stock filtering and seven sort modes.',
  })
  findAll(@Query() query: QueryProductDto) {
    return this.products.findAll(query);
  }

  @Get('facets')
  @Public()
  @ApiOperation({ summary: 'Filter facet counts for the current query' })
  getFacets(@Query() query: QueryProductDto) {
    return this.products.getFacets(query);
  }

  @Get(':slug')
  @Public()
  @ApiOperation({ summary: 'Product detail with variants, images, options and reviews' })
  findBySlug(@Param('slug') slug: string) {
    return this.products.findBySlug(slug);
  }

  @Get(':slug/related')
  @Public()
  @ApiQuery({ name: 'limit', required: false })
  @ApiOperation({ summary: 'Related products from the same category' })
  findRelated(@Param('slug') slug: string, @Query('limit') limit?: string) {
    return this.products.findRelated(slug, Math.min(Number(limit) || 8, 24));
  }
}

@ApiTags('Admin / Catalog')
@ApiBearerAuth()
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly admin: ProductsAdminService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  @ApiOperation({ summary: 'List all products including drafts and archived' })
  findAll(@Query() query: AdminProductQueryDto) {
    return this.admin.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  @ApiOperation({ summary: 'Full product record for the editor' })
  findOne(@Param('id') id: string) {
    return this.admin.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PRODUCT_WRITE)
  @Audit('product.create', 'Product')
  @ApiOperation({ summary: 'Create a product with its variants, stock and images' })
  create(@Body() dto: CreateProductDto) {
    return this.admin.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRODUCT_WRITE)
  @Audit('product.update', 'Product')
  @ApiOperation({ summary: 'Update a product and reconcile its variants' })
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.admin.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PRODUCT_DELETE)
  @Audit('product.delete', 'Product')
  @ApiOperation({ summary: 'Soft-delete (archive) a product' })
  remove(@Param('id') id: string) {
    return this.admin.remove(id);
  }
}
