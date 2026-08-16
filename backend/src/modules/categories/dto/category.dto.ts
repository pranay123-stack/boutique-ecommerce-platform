import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  IsNotEmpty,
} from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Silk Scarves' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ description: 'Auto-derived from name when omitted' })
  @IsOptional()
  @IsString()
  @MaxLength(140)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Parent category id; omit for a top-level category' })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) seoTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(320) seoDescription?: string;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
