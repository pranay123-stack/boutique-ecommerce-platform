import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsNotEmpty,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ContactStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class CreateContactMessageDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(120) name: string;

  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) orderNumber?: string;

  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(160) subject: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  message: string;

  /**
   * Honeypot. Real people never see this field, so anything in it came from a
   * bot filling in every input on the page.
   */
  @ApiPropertyOptional({ description: 'Leave empty' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}

export class UpdateContactMessageDto {
  @ApiProperty({ enum: ContactStatus }) @IsEnum(ContactStatus) status: ContactStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) staffNote?: string;
}

export class AdminContactQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ContactStatus })
  @IsOptional()
  @IsEnum(ContactStatus)
  status?: ContactStatus;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) search?: string;
}
