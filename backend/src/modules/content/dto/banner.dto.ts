import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsNotEmpty,
  MaxLength,
  Min,
} from 'class-validator';
import { BannerPlacement } from '@prisma/client';

export class CreateBannerDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(160) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(240) subtitle?: string;
  @ApiProperty() @IsString() @IsNotEmpty() imageUrl: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mobileImageUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() linkUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) ctaText?: string;
  @ApiPropertyOptional({ enum: BannerPlacement, default: BannerPlacement.HOME_HERO })
  @IsOptional()
  @IsEnum(BannerPlacement)
  placement?: BannerPlacement;
  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endsAt?: string;
}

export class UpdateBannerDto extends PartialType(CreateBannerDto) {}
