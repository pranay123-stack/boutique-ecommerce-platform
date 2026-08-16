import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsNotEmpty,
  Matches,
  MaxLength,
} from 'class-validator';
import { UserStatus } from '@prisma/client';

export class UpdateProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(80) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) lastName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s-]{7,20}$/, { message: 'Phone number format is invalid' })
  phone?: string;
}

export class CreateAddressDto {
  @ApiPropertyOptional({ example: 'Home' }) @IsOptional() @IsString() @MaxLength(40) label?: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(120) fullName: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(20) phone: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) line1: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) line2?: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(80) city: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(80) state: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(16) postalCode: string;
  @ApiPropertyOptional({ default: 'IN' }) @IsOptional() @IsString() @MaxLength(2) country?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefaultShipping?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefaultBilling?: boolean;
}

export class UpdateAddressDto extends PartialType(CreateAddressDto) {}

export class AdminUpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @ApiPropertyOptional({ enum: UserStatus }) @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
  @ApiPropertyOptional({ description: 'Role name, e.g. CUSTOMER or SUPPORT' })
  @IsOptional()
  @IsString()
  roleName?: string;
}
