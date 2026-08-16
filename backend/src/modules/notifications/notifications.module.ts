import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsService } from './notifications.service';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsListener } from './notifications.listener';
import { AdminNotificationsController, NotificationsController } from './notifications.controller';
import { EmailChannel } from './channels/email.channel';
import { SmsChannel } from './channels/sms.channel';
import { WhatsappChannel } from './channels/whatsapp.channel';
import { QUEUES } from '../../common/constants';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.NOTIFICATIONS })],
  providers: [
    NotificationsService,
    NotificationsProcessor,
    NotificationsListener,
    EmailChannel,
    SmsChannel,
    WhatsappChannel,
  ],
  controllers: [NotificationsController, AdminNotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
