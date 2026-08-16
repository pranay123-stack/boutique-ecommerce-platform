import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class AddWishlistItemDto {
  @ApiProperty() @IsString() @IsNotEmpty() productId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() variantId?: string;
}
