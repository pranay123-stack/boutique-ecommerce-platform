import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsNotEmpty, MaxLength, Min } from 'class-validator';

export class CreatePaymentIntentDto {
  @ApiProperty({ description: 'Order id to pay for' })
  @IsString()
  @IsNotEmpty()
  orderId: string;
}

export class VerifyPaymentDto {
  @ApiProperty() @IsString() @IsNotEmpty() orderId: string;
  @ApiProperty({ example: 'order_XXXXXXXX' }) @IsString() @IsNotEmpty() providerOrderId: string;
  @ApiProperty({ example: 'pay_XXXXXXXX' }) @IsString() @IsNotEmpty() providerPaymentId: string;
  @ApiProperty({ description: 'HMAC returned by the gateway checkout' })
  @IsString()
  @IsNotEmpty()
  signature: string;
}

export class CreateRefundDto {
  @ApiProperty({ description: 'Amount to refund in store currency' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(400) reason?: string;
}
