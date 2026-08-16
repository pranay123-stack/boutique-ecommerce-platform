import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BannerPlacement } from '@prisma/client';
import { ContentService } from './content.service';
import { CreateBannerDto, UpdateBannerDto } from './dto/banner.dto';
import { Audit, Public, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/constants';

@ApiTags('Content')
@Controller('content')
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get('homepage')
  @Public()
  @ApiOperation({
    summary: 'Complete homepage payload',
    description: 'Banners, featured, new arrivals, best sellers and categories in one cached call.',
  })
  homepage() {
    return this.content.getHomepage();
  }

  @Get('settings')
  @Public()
  @ApiOperation({ summary: 'Public storefront settings' })
  settings() {
    return this.content.getAllSettings();
  }

  @Get('image-credits')
  @Public()
  @ApiOperation({
    summary: 'Photographer attribution for demo imagery',
    description:
      'Keyed by image path. Empty once the merchant supplies their own photographs.',
  })
  imageCredits() {
    return this.content.imageCredits();
  }
}

@ApiTags('Admin / Content')
@ApiBearerAuth()
@Controller('admin/content')
export class AdminContentController {
  constructor(private readonly content: ContentService) {}

  @Get('banners')
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiQuery({ name: 'placement', required: false, enum: BannerPlacement })
  @ApiOperation({ summary: 'List banners' })
  findAll(@Query('placement') placement?: BannerPlacement) {
    return this.content.findAllBanners(placement);
  }

  @Post('banners')
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @Audit('banner.create', 'Banner')
  @ApiOperation({ summary: 'Create a banner' })
  create(@Body() dto: CreateBannerDto) {
    return this.content.createBanner(dto);
  }

  @Patch('banners/:id')
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @Audit('banner.update', 'Banner')
  @ApiOperation({ summary: 'Update a banner' })
  update(@Param('id') id: string, @Body() dto: UpdateBannerDto) {
    return this.content.updateBanner(id, dto);
  }

  @Delete('banners/:id')
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @Audit('banner.delete', 'Banner')
  @ApiOperation({ summary: 'Delete a banner' })
  remove(@Param('id') id: string) {
    return this.content.deleteBanner(id);
  }

  @Post('featured-products')
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @Audit('content.set_featured', 'Product')
  @ApiOperation({ summary: 'Replace the featured product selection' })
  setFeatured(@Body('productIds') productIds: string[]) {
    return this.content.setFeaturedProducts(productIds ?? []);
  }

  @Patch('settings/:key')
  @RequirePermissions(PERMISSIONS.SETTINGS_WRITE)
  @Audit('settings.update', 'Setting')
  @ApiOperation({ summary: 'Update a store setting' })
  setSetting(@Param('key') key: string, @Body('value') value: unknown) {
    return this.content.setSetting(key, value);
  }
}
