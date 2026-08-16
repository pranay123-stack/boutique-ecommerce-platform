import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsNotEmpty, Max, MaxLength, Min } from 'class-validator';

export class AddToCartDto {
  @ApiProperty({ description: 'Product variant id' })
  @IsString()
  @IsNotEmpty()
  variantId: string;

  @ApiProperty({ example: 1, minimum: 1, maximum: 99 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  quantity: number;
}

export class UpdateCartItemDto {
  @ApiProperty({ example: 2, minimum: 0, description: 'Zero removes the line' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99)
  quantity: number;
}

export class ApplyCartCouponDto {
  @ApiProperty({ example: 'WELCOME10' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  code: string;
}

export class MergeCartDto {
  @ApiPropertyOptional({ description: 'Guest session id whose cart should be merged in' })
  @IsOptional()
  @IsString()
  sessionId?: string;
}
