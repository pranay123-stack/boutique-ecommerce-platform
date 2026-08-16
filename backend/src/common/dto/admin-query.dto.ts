import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  NotificationChannel,
  NotificationStatus,
  OrderStatus,
  PaymentStatus,
  ProductStatus,
  ReviewStatus,
  UserStatus,
} from '@prisma/client';
import { PaginationQueryDto } from './pagination.dto';

/**
 * Filter DTOs for admin list endpoints.
 *
 * These exist because the global ValidationPipe runs with
 * `forbidNonWhitelisted: true`. Binding `@Query() dto: PaginationQueryDto` and
 * then reading extra params with `@Query('search')` fails: the pipe validates
 * the whole query object against PaginationQueryDto and rejects anything it
 * does not declare, so every filtered admin request returned 400. Declaring
 * the full query shape in one DTO is the correct fix - and it documents the
 * supported filters in Swagger for free.
 */

export class AdminProductQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Match product name or variant SKU' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;
}

export class AdminOrderQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional({ description: 'Order number, customer email or name' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ description: 'ISO date, inclusive' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date, inclusive' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class AdminCustomerQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Name, email or phone' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class AdminCouponQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  search?: string;
}

export class AdminReviewQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ReviewStatus })
  @IsOptional()
  @IsEnum(ReviewStatus)
  status?: ReviewStatus;
}

export class AdminNotificationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: NotificationStatus })
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;

  @ApiPropertyOptional({ enum: NotificationChannel })
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;
}
