import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto, UpdateReviewStatusDto } from './dto/review.dto';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { AdminReviewQueryDto } from '../../common/dto/admin-query.dto';
import { Audit, CurrentUser, Public, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/constants';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('product/:productId')
  @Public()
  @ApiOperation({ summary: 'Approved reviews and rating distribution for a product' })
  findForProduct(@Param('productId') productId: string, @Query() query: PaginationQueryDto) {
    return this.reviews.findForProduct(productId, query);
  }

  @Post()
  @ApiBearerAuth()
  @Audit('review.create', 'Review')
  @ApiOperation({
    summary: 'Write a review',
    description: 'Restricted to verified purchasers; submitted reviews await moderation.',
  })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateReviewDto) {
    return this.reviews.create(userId, dto);
  }

  @Get('mine')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reviews written by the signed-in customer' })
  findMine(@CurrentUser('id') userId: string, @Query() query: PaginationQueryDto) {
    return this.reviews.findMine(userId, query);
  }
}

@ApiTags('Admin / Reviews')
@ApiBearerAuth()
@Controller('admin/reviews')
export class AdminReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.REVIEW_MODERATE)
  @ApiOperation({ summary: 'Moderation queue' })
  findAll(@Query() query: AdminReviewQueryDto) {
    return this.reviews.findAllAdmin(query);
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.REVIEW_MODERATE)
  @Audit('review.moderate', 'Review')
  @ApiOperation({ summary: 'Approve or reject a review' })
  setStatus(@Param('id') id: string, @Body() dto: UpdateReviewStatusDto) {
    return this.reviews.setStatus(id, dto.status);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.REVIEW_MODERATE)
  @Audit('review.delete', 'Review')
  @ApiOperation({ summary: 'Delete a review' })
  remove(@Param('id') id: string) {
    return this.reviews.remove(id);
  }
}
