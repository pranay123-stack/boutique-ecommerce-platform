import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsNotEmpty,
  Min,
  ValidateNested,
} from 'class-validator';
import { AddressInputDto } from '../../orders/dto/order.dto';

export class ValidateAddressDto {
  @ApiProperty({ type: AddressInputDto })
  @ValidateNested()
  @Type(() => AddressInputDto)
  address: AddressInputDto;
}

export class RateQuoteDto {
  @ApiProperty({ example: '560001' })
  @IsString()
  @IsNotEmpty()
  postalCode: string;

  @ApiPropertyOptional({ default: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weightGrams?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  declaredValue?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  cod?: boolean;
}

export class CreateShipmentDto {
  @ApiPropertyOptional({ description: 'Carrier id from the rate quote' })
  @IsOptional()
  @IsString()
  courierId?: string;
}
