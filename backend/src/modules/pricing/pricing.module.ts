import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { CouponsModule } from '../coupons/coupons.module';

@Module({
  imports: [CouponsModule],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
