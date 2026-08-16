import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsNotEmpty,
  MaxLength,
  Min,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { ReturnResolution, ReturnStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

/** Reasons offered in the UI. Free text lives in `note`. */
export const RETURN_REASONS = [
  'DOES_NOT_FIT',
  'NOT_AS_DESCRIBED',
  'DAMAGED_OR_DEFECTIVE',
  'WRONG_ITEM_SENT',
  'ARRIVED_LATE',
  'CHANGED_MIND',
  'OTHER',
] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

/** Reasons that make the return our fault, so we absorb the shipping. */
export const MERCHANT_FAULT_REASONS: ReturnReason[] = [
  'DAMAGED_OR_DEFECTIVE',
  'WRONG_ITEM_SENT',
  'NOT_AS_DESCRIBED',
];

export class ReturnItemInputDto {
  @ApiProperty() @IsString() @IsNotEmpty() orderItemId: string;
  @ApiProperty({ minimum: 1 }) @Type(() => Number) @IsInt() @Min(1) quantity: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class CreateReturnDto {
  @ApiProperty() @IsString() @IsNotEmpty() orderId: string;

  @ApiProperty({ enum: RETURN_REASONS })
  @IsEnum(RETURN_REASONS as unknown as Record<string, string>)
  reason: ReturnReason;

  @ApiPropertyOptional({ enum: ReturnResolution, default: ReturnResolution.REFUND })
  @IsOptional()
  @IsEnum(ReturnResolution)
  resolution?: ReturnResolution;

  @ApiProperty({ type: [ReturnItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnItemInputDto)
  items: ReturnItemInputDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) customerNote?: string;

  @ApiPropertyOptional({ description: 'Required when the order was placed as a guest' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  guestEmail?: string;
}

export class InspectReturnItemDto {
  @ApiProperty() @IsString() @IsNotEmpty() returnItemId: string;
  @ApiProperty({ description: 'Whether the item can go back on sale' })
  @IsBoolean()
  restockable: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class InspectReturnDto {
  @ApiProperty({ type: [InspectReturnItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InspectReturnItemDto)
  items: InspectReturnItemDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) staffNote?: string;
}

export class UpdateReturnStatusDto {
  @ApiProperty({ enum: ReturnStatus })
  @IsEnum(ReturnStatus)
  status: ReturnStatus;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) staffNote?: string;
}

export class AdminReturnQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ReturnStatus })
  @IsOptional()
  @IsEnum(ReturnStatus)
  status?: ReturnStatus;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) search?: string;
}
