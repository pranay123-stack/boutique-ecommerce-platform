import { Module } from '@nestjs/common';
import { SupportService } from './support.service';
import { SupportAdminController, SupportController } from './support.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [SupportController, SupportAdminController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
