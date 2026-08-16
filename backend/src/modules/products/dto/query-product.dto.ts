import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export enum ProductSort {
  RELEVANCE = 'relevance',
  NEWEST = 'newest',
  PRICE_ASC = 'price_asc',
  PRICE_DESC = 'price_desc',
  BEST_SELLING = 'best_selling',
  RATING = 'rating',
  NAME_ASC = 'name_asc',
}

const csv = ({ value }: { value: unknown }): string[] | undefined => {
  if (Array.isArray(value)) return value as string[];
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return undefined;
};

const bool = ({ value }: { value: unknown }) => value === true || value === 'true' || value === '1';

export class QueryProductDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Full-text search across name, brand and description' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ description: 'Category slug. Includes all subcategories.' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Comma-separated brand names' })
  @IsOptional()
  @Transform(csv)
  @IsString({ each: true })
  brands?: string[];

  @ApiPropertyOptional({
    description: 'Comma-separated attribute value slugs, e.g. size-m,color-black',
  })
  @IsOptional()
  @Transform(csv)
  @IsString({ each: true })
  attributes?: string[];

  @ApiPropertyOptional({ description: 'Comma-separated tags' })
  @IsOptional()
  @Transform(csv)
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({ description: 'Only products with available stock' })
  @IsOptional()
  @Transform(bool)
  @IsBoolean()
  inStock?: boolean;

  @ApiPropertyOptional() @IsOptional() @Transform(bool) @IsBoolean() featured?: boolean;
  @ApiPropertyOptional() @IsOptional() @Transform(bool) @IsBoolean() newArrivals?: boolean;

  @ApiPropertyOptional({ enum: ProductSort, default: ProductSort.NEWEST })
  @IsOptional()
  @IsEnum(ProductSort)
  sort?: ProductSort;
}
