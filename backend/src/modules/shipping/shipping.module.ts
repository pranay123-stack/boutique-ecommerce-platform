import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ShippingService } from './shipping.service';
import { AdminShippingController, ShippingController } from './shipping.controller';
import { ShiprocketProvider } from './providers/shiprocket.provider';
import { MockShippingProvider } from './providers/mock-shipping.provider';
import { SHIPPING_PROVIDER } from './providers/shipping-provider.interface';
import { CacheService } from '../../redis/cache.service';

@Module({
  providers: [
    ShippingService,
    MockShippingProvider,
    {
      provide: ShiprocketProvider,
      inject: [ConfigService, CacheService],
      useFactory: (config: ConfigService, cache: CacheService) =>
        new ShiprocketProvider(config, cache),
    },
    {
      provide: SHIPPING_PROVIDER,
      inject: [ConfigService, ShiprocketProvider, MockShippingProvider],
      useFactory: (
        config: ConfigService,
        shiprocket: ShiprocketProvider,
        mock: MockShippingProvider,
      ) => {
        if (config.get<string>('shipping.mode') === 'mock') return mock;
        switch (config.get<string>('shipping.provider')) {
          case 'shiprocket':
            return shiprocket;
          default:
            throw new Error(`Unsupported shipping provider: ${config.get('shipping.provider')}`);
        }
      },
    },
  ],
  controllers: [ShippingController, AdminShippingController],
  exports: [ShippingService, SHIPPING_PROVIDER],
})
export class ShippingModule {}
