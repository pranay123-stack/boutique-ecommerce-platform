import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';
import { CreatePaymentIntentDto, CreateRefundDto, VerifyPaymentDto } from './dto/payment.dto';
import {
  Audit,
  CurrentUser,
  Public,
  RequirePermissions,
  type AuthenticatedUser,
} from '../../common/decorators';
import { PERMISSIONS } from '../../common/constants';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('intent')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a gateway payment order',
    description: 'The charge amount is taken from the stored order, never from the request body.',
  })
  createIntent(
    @Body() dto: CreatePaymentIntentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Query('email') email?: string,
  ) {
    return this.payments.createIntent(dto.orderId, {
      userId: user?.id,
      email: email?.toLowerCase(),
    });
  }

  @Post('verify')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Audit('payment.verify', 'Payment')
  @ApiOperation({
    summary: 'Verify a completed checkout',
    description:
      'Validates the gateway HMAC, re-reads the payment from the gateway and checks the amount ' +
      'against the order total before settling.',
  })
  verify(
    @Body() dto: VerifyPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Query('email') email?: string,
  ) {
    return this.payments.verify(dto, { userId: user?.id, email: email?.toLowerCase() });
  }

  @Post('mock/complete')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[dev only] Complete a mock payment',
    description:
      'Available only when PAYMENT_MODE=mock. Signs the checkout as the gateway would and runs ' +
      'the real verification path. Returns 403 when a live gateway is configured.',
  })
  completeMock(
    @Body() dto: CreatePaymentIntentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Query('email') email?: string,
  ) {
    return this.payments.completeMockPayment(dto.orderId, {
      userId: user?.id,
      email: email?.toLowerCase(),
    });
  }

  @Get('order/:orderId')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.ORDER_READ)
  @ApiOperation({ summary: 'Payment attempts recorded against an order' })
  findByOrder(@Param('orderId') orderId: string) {
    return this.payments.findByOrder(orderId);
  }
}

@ApiTags('Payments')
@Controller('webhooks')
export class PaymentWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  /**
   * Gateway callback. Deliberately unauthenticated - trust comes from the HMAC
   * over the raw body, which is why `main.ts` preserves `rawBody` for this path.
   */
  @Post('razorpay')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async razorpay(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-razorpay-signature') signature: string,
    @Body() body: unknown,
  ) {
    if (!signature) throw new BadRequestException('Missing webhook signature');
    // Fall back to a re-serialised body only if the raw capture is unavailable.
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(body));
    return this.payments.handleWebhook(raw, signature);
  }
}

@ApiTags('Admin / Payments')
@ApiBearerAuth()
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('orders/:orderId/refund')
  @RequirePermissions(PERMISSIONS.ORDER_REFUND)
  @Audit('payment.refund', 'Refund')
  @ApiOperation({ summary: 'Issue a full or partial refund' })
  refund(
    @Param('orderId') orderId: string,
    @Body() dto: CreateRefundDto,
    @CurrentUser('id') actorUserId: string,
  ) {
    return this.payments.createRefund(orderId, dto, actorUserId);
  }

  @Post('reconcile')
  @RequirePermissions(PERMISSIONS.ORDER_REFUND)
  @Audit('payment.reconcile', 'Payment')
  @ApiOperation({ summary: 'Re-read stale pending payments from the gateway' })
  reconcile() {
    return this.payments.reconcilePendingPayments();
  }

  @Post('webhooks/retry')
  @RequirePermissions(PERMISSIONS.ORDER_REFUND)
  @ApiOperation({ summary: 'Re-process webhook events that previously failed' })
  retryWebhooks() {
    return this.payments.retryFailedWebhooks();
  }
}
