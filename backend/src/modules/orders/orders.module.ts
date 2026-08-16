import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersAdminService } from './orders-admin.service';
import { AdminOrdersController, OrdersController } from './orders.controller';
import { PricingModule } from '../pricing/pricing.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CouponsModule } from '../coupons/coupons.module';

@Module({
  imports: [PricingModule, InventoryModule, CouponsModule],
  providers: [OrdersService, OrdersAdminService],
  controllers: [OrdersController, AdminOrdersController],
  exports: [OrdersService, OrdersAdminService],
})
export class OrdersModule {}
