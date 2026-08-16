import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsNotEmpty,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { CouponScope, CouponType } from '@prisma/client';

export class CreateCouponDto {
  @ApiProperty({ example: 'WELCOME10' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'Code must be uppercase letters, digits, hyphen or underscore',
  })
  code: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) description?: string;

  @ApiProperty({ enum: CouponType }) @IsEnum(CouponType) type: CouponType;

  @ApiProperty({ example: 10, description: 'Percent (0-100) or fixed amount' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  value: number;

  @ApiPropertyOptional({ enum: CouponScope, default: CouponScope.ALL })
  @IsOptional()
  @IsEnum(CouponScope)
  scope?: CouponScope;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minOrderValue?: number;

  @ApiPropertyOptional({ description: 'Caps the discount on percentage coupons' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxDiscountAmount?: number;

  @ApiPropertyOptional({ description: 'Total redemptions allowed across all customers' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  usageLimit?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  usageLimitPerUser?: number;

  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiresAt?: string;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() isActive?: boolean;

  @ApiPropertyOptional({ type: [String], description: 'Restrict to these category ids' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Restrict to these product ids' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];
}

export class UpdateCouponDto extends PartialType(CreateCouponDto) {}

export class ApplyCouponDto {
  @ApiProperty({ example: 'WELCOME10' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  code: string;
}
