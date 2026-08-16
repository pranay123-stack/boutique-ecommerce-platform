import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotificationChannel, NotificationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailChannel } from './channels/email.channel';
import { SmsChannel } from './channels/sms.channel';
import { WhatsappChannel } from './channels/whatsapp.channel';
import { renderTemplate, type TemplateName } from './templates/templates';
import { QUEUES } from '../../common/constants';
import { paginate, skipOf, type PageParams } from '../../common/dto/pagination.dto';
import type { INotificationChannel } from './channels/channel.interface';

export interface DispatchInput {
  channel: NotificationChannel;
  template: TemplateName;
  recipient: string;
  userId?: string | null;
  payload: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly channels: Map<NotificationChannel, INotificationChannel>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    email: EmailChannel,
    sms: SmsChannel,
    whatsapp: WhatsappChannel,
    @InjectQueue(QUEUES.NOTIFICATIONS) private readonly queue: Queue,
  ) {
    this.channels = new Map<NotificationChannel, INotificationChannel>([
      [NotificationChannel.EMAIL, email],
      [NotificationChannel.SMS, sms],
      [NotificationChannel.WHATSAPP, whatsapp],
    ]);
  }

  /**
   * Queue a notification.
   *
   * The database row is created first and the job references it, so a message
   * is never "sent but unrecorded" - and if Redis is unavailable we fall back
   * to sending inline rather than silently dropping a customer's receipt.
   */
  async dispatch(input: DispatchInput): Promise<{ id: string; queued: boolean }> {
    const rendered = renderTemplate(input.template, input.payload);

    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId ?? null,
        channel: input.channel,
        template: input.template,
        recipient: input.recipient,
        subject: rendered.subject,
        payload: input.payload as Prisma.InputJsonValue,
        status: NotificationStatus.PENDING,
      },
    });

    try {
      await this.queue.add(
        'send',
        { notificationId: notification.id },
        {
          attempts: 5,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: { count: 500 },
          removeOnFail: { count: 1000 },
        },
      );
      return { id: notification.id, queued: true };
    } catch (err) {
      this.logger.warn(
        `Queue unavailable (${(err as Error).message}); sending notification ${notification.id} inline`,
      );
      await this.deliver(notification.id);
      return { id: notification.id, queued: false };
    }
  }

  /** Perform the actual send. Called by the queue worker (or inline fallback). */
  async deliver(notificationId: string): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification) return;
    if (notification.status === NotificationStatus.SENT) return;

    const channel = this.channels.get(notification.channel);
    if (!channel) {
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: NotificationStatus.FAILED,
          error: `No handler for ${notification.channel}`,
        },
      });
      return;
    }

    const rendered = renderTemplate(
      notification.template as TemplateName,
      (notification.payload ?? {}) as Record<string, unknown>,
    );

    const result = await channel.send({
      recipient: notification.recipient,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: result.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
        providerMessageId: result.providerMessageId ?? null,
        error: result.error ?? null,
        attempts: { increment: 1 },
        sentAt: result.success ? new Date() : null,
      },
    });

    // Throwing signals BullMQ to retry with backoff.
    if (!result.success) throw new Error(result.error ?? 'Notification delivery failed');
  }

  frontendUrl(path: string): string {
    const base = this.config.get<string>('app.frontendUrl') ?? '';
    return `${base.replace(/\/$/, '')}${path}`;
  }

  async findForUser(userId: string, query: PageParams) {
    const where = { userId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: skipOf(query),
        take: query.limit,
        select: {
          id: true,
          channel: true,
          template: true,
          subject: true,
          status: true,
          sentAt: true,
          createdAt: true,
        },
      }),
      this.prisma.notification.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }

  async findAll(
    query: PageParams & { status?: NotificationStatus; channel?: NotificationChannel },
  ) {
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: skipOf(query),
        take: query.limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }
}
