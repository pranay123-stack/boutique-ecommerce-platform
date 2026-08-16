import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { Audit, Public, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/constants';

@ApiTags('Catalog')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get('tree')
  @Public()
  @ApiOperation({ summary: 'Category tree with rolled-up product counts' })
  getTree() {
    return this.categories.getTree();
  }

  @Get(':slug')
  @Public()
  @ApiOperation({ summary: 'Category detail by slug' })
  findBySlug(@Param('slug') slug: string) {
    return this.categories.findBySlug(slug);
  }
}

@ApiTags('Admin / Catalog')
@ApiBearerAuth()
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  @ApiOperation({ summary: 'List every category, including inactive' })
  findAll() {
    return this.categories.findAllFlat();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CATEGORY_WRITE)
  @Audit('category.create', 'Category')
  @ApiOperation({ summary: 'Create a category or subcategory' })
  create(@Body() dto: CreateCategoryDto) {
    return this.categories.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CATEGORY_WRITE)
  @Audit('category.update', 'Category')
  @ApiOperation({ summary: 'Update a category' })
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categories.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CATEGORY_WRITE)
  @Audit('category.delete', 'Category')
  @ApiOperation({ summary: 'Soft-delete an empty category' })
  remove(@Param('id') id: string) {
    return this.categories.remove(id);
  }
}
