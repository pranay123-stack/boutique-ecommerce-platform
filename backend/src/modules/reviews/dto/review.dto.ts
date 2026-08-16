import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsNotEmpty,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ReviewStatus } from '@prisma/client';

export class CreateReviewDto {
  @ApiProperty() @IsString() @IsNotEmpty() productId: string;
  @ApiProperty({ minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}

export class UpdateReviewStatusDto {
  @ApiProperty({ enum: ReviewStatus }) @IsEnum(ReviewStatus) status: ReviewStatus;
}
