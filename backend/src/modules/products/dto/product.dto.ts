import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsNotEmpty,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ProductStatus } from '@prisma/client';
import { GST_SLABS } from '../../tax/gst.constants';

export class VariantAttributeDto {
  @ApiProperty({ example: 'Size' }) @IsString() @IsNotEmpty() attributeName: string;
  @ApiProperty({ example: 'M' }) @IsString() @IsNotEmpty() value: string;
  @ApiPropertyOptional({ example: '#000000' }) @IsOptional() @IsString() hexColor?: string;
}

export class CreateVariantDto {
  @ApiProperty({ example: 'BQ-SCARF-RED-M' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  sku: string;

  @ApiProperty({ example: 'Red / Medium' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  @ApiProperty({ example: 1499.0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 1199.0, description: 'Must not exceed price' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costPrice?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() barcode?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  weightGrams?: number;

  @ApiProperty({ example: 25, description: 'Opening stock level' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stockQuantity: number;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;

  @ApiPropertyOptional({ type: [VariantAttributeDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantAttributeDto)
  attributes?: VariantAttributeDto[];

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;
}

export class ProductImageDto {
  @ApiProperty() @IsString() @IsNotEmpty() url: string;
  @ApiPropertyOptional() @IsOptional() @IsString() thumbnailUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() alt?: string;
  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() isPrimary?: boolean;
  @ApiPropertyOptional({ description: 'Attach this image to a specific variant SKU' })
  @IsOptional()
  @IsString()
  variantSku?: string;
}

export class CreateProductDto {
  @ApiProperty({ example: 'Hand-Rolled Silk Scarf' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(220) slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(8000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(400) shortDescription?: string;

  @ApiProperty() @IsString() @IsNotEmpty() categoryId: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) brand?: string;

  @ApiProperty({ example: 1499.0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basePrice: number;

  @ApiPropertyOptional({ description: 'Struck-through reference price' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  compareAtPrice?: number;

  @ApiPropertyOptional({
    example: '6204',
    description:
      'HSN code for this product. Required on a GST tax invoice; leaving it ' +
      'blank falls back to the 9999 catch-all at the standard 18% rate.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4,8}$/, { message: 'An HSN code is 4 to 8 digits' })
  hsnCode?: string;

  @ApiPropertyOptional({
    default: 0,
    description: 'GST rate. Must be a rate that exists in law: 0, 0.25, 3, 5, 12, 18 or 28.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  // A rate outside the statutory slabs is always a data-entry error, and it
  // would be charged to real customers and reported on a real return.
  @IsIn(GST_SLABS as unknown as number[], {
    message: `taxRatePercent must be one of ${GST_SLABS.join(', ')}`,
  })
  taxRatePercent?: number;

  @ApiPropertyOptional({ enum: ProductStatus, default: ProductStatus.DRAFT })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFeatured?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isNewArrival?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) seoTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(320) seoDescription?: string;

  @ApiProperty({ type: [CreateVariantDto], description: 'At least one variant is required' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants: CreateVariantDto[];

  @ApiPropertyOptional({ type: [ProductImageDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImageDto)
  images?: ProductImageDto[];
}

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiPropertyOptional({ type: [CreateVariantDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[];
}
