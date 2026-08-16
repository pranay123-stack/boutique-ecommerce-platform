import { Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import {
  AdminPaymentsController,
  PaymentWebhookController,
  PaymentsController,
} from './payments.controller';
import { OrdersModule } from '../orders/orders.module';
import { RazorpayProvider } from './providers/razorpay.provider';
import { MockPaymentProvider } from './providers/mock.provider';
import { PAYMENT_PROVIDER } from './providers/payment-provider.interface';

/**
 * The gateway adapter is chosen at boot from PAYMENT_MODE / PAYMENT_PROVIDER.
 * Everything downstream depends on the IPaymentProvider interface only, so
 * adding Stripe or PayPal is a new class plus a case in this factory.
 */
@Module({
  imports: [OrdersModule],
  providers: [
    PaymentsService,
    RazorpayProvider,
    MockPaymentProvider,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService, RazorpayProvider, MockPaymentProvider],
      useFactory: (
        config: ConfigService,
        razorpay: RazorpayProvider,
        mock: MockPaymentProvider,
      ) => {
        const mode = config.get<string>('payment.mode');
        const isProduction = config.get<boolean>('app.isProduction');

        if (mode === 'mock') {
          if (isProduction) {
            throw new Error(
              'PAYMENT_MODE=mock is not permitted in production - real payments must use a live gateway',
            );
          }
          return mock;
        }

        const provider = config.get<string>('payment.provider');
        switch (provider) {
          case 'razorpay':
            return razorpay;
          default:
            Logger.error(`Unsupported PAYMENT_PROVIDER "${provider}"`, 'PaymentsModule');
            throw new Error(`Unsupported payment provider: ${provider}`);
        }
      },
    },
  ],
  controllers: [PaymentsController, PaymentWebhookController, AdminPaymentsController],
  exports: [PaymentsService, PAYMENT_PROVIDER, MockPaymentProvider],
})
export class PaymentsModule {}
