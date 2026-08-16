import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { InventoryChangeType } from '@prisma/client';

export class AdjustStockDto {
  @ApiProperty({ description: 'Absolute new quantity on hand' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity: number;

  @ApiProperty({ enum: InventoryChangeType, example: InventoryChangeType.ADJUSTMENT })
  @IsEnum(InventoryChangeType)
  changeType: InventoryChangeType;

  @ApiPropertyOptional({ example: 'Stock count correction after audit' })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  reason?: string;
}

export class RestockDto {
  @ApiProperty({ description: 'Units to add to the current quantity' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(400) reason?: string;
}

export class UpdateThresholdDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) lowStockThreshold: number;
}
