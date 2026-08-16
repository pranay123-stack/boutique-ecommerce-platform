import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';

import { configuration } from './config/configuration';

/** True only when the optional pino-pretty transport is actually installed. */
function isPrettyAvailable(): boolean {
  try {
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

import { validateEnv } from './config/env.validation';
import { buildThrottlerConfig } from './config/throttler.config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ProductsModule } from './modules/products/products.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { CouponsModule } from './modules/coupons/coupons.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { TaxModule } from './modules/tax/tax.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { ReturnsModule } from './modules/returns/returns.module';
import { SupportModule } from './modules/support/support.module';
import { CartModule } from './modules/cart/cart.module';
import { WishlistModule } from './modules/wishlist/wishlist.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ContentModule } from './modules/content/content.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { TasksModule } from './modules/tasks/tasks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
      envFilePath: process.env.NODE_ENV === 'test' ? ['.env.test'] : ['.env'],
      cache: true,
    }),

    // Structured JSON logs in production, human-readable in development.
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get<string>('observability.logLevel'),
          genReqId: (req) => (req.headers['x-request-id'] as string) ?? randomUUID(),
          autoLogging: !config.get<boolean>('app.isTest'),
          // Pretty printing is a development affordance. `pino-pretty` is a
          // devDependency, so it is absent from the production image - and pino
          // fails hard ("unable to determine transport target") rather than
          // degrading. Resolving it first means a stray LOG_PRETTY=true in a
          // production environment falls back to JSON logs instead of refusing
          // to boot.
          transport:
            config.get<boolean>('observability.logPretty') && isPrettyAvailable()
              ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'HH:MM:ss' } }
              : undefined,
          // Credentials must never reach the log sink.
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-csrf-token"]',
              'req.body.password',
              'req.body.newPassword',
              'req.body.currentPassword',
              'res.headers["set-cookie"]',
            ],
            censor: '[REDACTED]',
          },
        },
      }),
    }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: buildThrottlerConfig,
    }),

    EventEmitterModule.forRoot({ maxListeners: 30, verboseMemoryLeak: true }),
    ScheduleModule.forRoot(),

    // Background jobs. Sharing the Redis instance with the cache is fine at
    // this scale; BullMQ namespaces its own keys.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          password: config.get<string>('redis.password'),
          db: config.get<number>('redis.db'),
          ...(config.get<boolean>('redis.tls') ? { tls: {} } : {}),
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: { count: 200 },
          removeOnFail: { count: 500 },
        },
      }),
    }),

    PrismaModule,
    RedisModule,
    AuditModule,
    AuthModule,
    HealthModule,

    // Domain modules
    UsersModule,
    CategoriesModule,
    ProductsModule,
    InventoryModule,
    CouponsModule,
    TaxModule,
    PricingModule,
    InvoicesModule,
    ReturnsModule,
    SupportModule,
    CartModule,
    WishlistModule,
    OrdersModule,
    PaymentsModule,
    ShippingModule,
    NotificationsModule,
    ReviewsModule,
    AnalyticsModule,
    ContentModule,
    UploadsModule,
    TasksModule,
  ],
  providers: [
    // Order matters: authentication runs before authorisation, and both run
    // before the throttler sees an identified principal.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    {
      provide: APP_FILTER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new AllExceptionsFilter(config.get<boolean>('app.isProduction') ?? false),
    },
  ],
})
export class AppModule implements NestModule {
  configure(_consumer: MiddlewareConsumer): void {
    // Reserved for per-route middleware; global concerns live in main.ts.
    void _consumer;
    void RequestMethod;
  }
}
