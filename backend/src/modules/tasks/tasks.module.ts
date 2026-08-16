import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { PaymentsModule } from '../payments/payments.module';
import { ShippingModule } from '../shipping/shipping.module';

@Module({
  imports: [PaymentsModule, ShippingModule],
  providers: [TasksService],
})
export class TasksModule {}
