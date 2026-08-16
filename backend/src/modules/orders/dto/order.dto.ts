import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsNotEmpty,
  MaxLength,
  ValidateNested,
  IsBoolean,
  IsIn,
} from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class AddressInputDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(120) fullName: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(20) phone: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) line1: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) line2?: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(80) city: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(80) state: string;
  @ApiProperty({ example: '560001' }) @IsString() @IsNotEmpty() @MaxLength(16) postalCode: string;
  @ApiPropertyOptional({ default: 'IN' }) @IsOptional() @IsString() @MaxLength(2) country?: string;
}

export class CreateOrderDto {
  @ApiPropertyOptional({ description: 'Required for guest checkout' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  guestEmail?: string;

  @ApiProperty({ type: AddressInputDto })
  @ValidateNested()
  @Type(() => AddressInputDto)
  shippingAddress: AddressInputDto;

  @ApiPropertyOptional({ type: AddressInputDto, description: 'Defaults to the shipping address' })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressInputDto)
  billingAddress?: AddressInputDto;

  @ApiPropertyOptional({ description: 'Persist the shipping address to the customer profile' })
  @IsOptional()
  @IsBoolean()
  saveAddress?: boolean;

  @ApiPropertyOptional({
    enum: ['PREPAID', 'COD'],
    default: 'PREPAID',
    description: 'COD skips the payment gateway; the courier collects the money',
  })
  @IsOptional()
  @IsIn(['PREPAID', 'COD'])
  paymentMethod?: 'PREPAID' | 'COD';

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) customerNote?: string;
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class CancelOrderDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
