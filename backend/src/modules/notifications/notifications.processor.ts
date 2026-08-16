import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { NotificationsService } from './notifications.service';
import { QUEUES } from '../../common/constants';

/**
 * Background worker for notification delivery.
 *
 * Sending email inline would tie checkout latency - and success - to an SMTP
 * server's mood. Here a slow provider costs a retry, not a failed order.
 */
@Processor(QUEUES.NOTIFICATIONS, { concurrency: 5 })
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(private readonly notifications: NotificationsService) {
    super();
  }

  async process(job: Job<{ notificationId: string }>): Promise<void> {
    await this.notifications.deliver(job.data.notificationId);
  }

  onFailed(job: Job, err: Error): void {
    this.logger.error(
      `Notification job ${job.id} failed (attempt ${job.attemptsMade}): ${err.message}`,
    );
  }
}
