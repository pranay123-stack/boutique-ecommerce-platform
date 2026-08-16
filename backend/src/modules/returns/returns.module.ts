import { Module } from '@nestjs/common';
import { ReturnsService } from './returns.service';
import { ReturnsAdminController, ReturnsController } from './returns.controller';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [InventoryModule],
  controllers: [ReturnsController, ReturnsAdminController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
