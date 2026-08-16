import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContactStatus, NotificationChannel, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { paginate, skipOf } from '../../common/dto/pagination.dto';
import type {
  AdminContactQueryDto,
  CreateContactMessageDto,
  UpdateContactMessageDto,
} from './dto/contact.dto';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);
  private readonly supportInbox: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    config: ConfigService,
  ) {
    this.supportInbox = config.get<string>('support.inbox') ?? '';
  }

  /**
   * Record a contact-form message and alert the team.
   *
   * Stored before it is emailed, on purpose: an inbox is not a system of
   * record, and a customer's message must not be lost because SMTP was down
   * for a minute.
   */
  async submit(
    dto: CreateContactMessageDto,
    meta: { ipAddress?: string; userAgent?: string } = {},
  ) {
    // Bots fill in every field they find, including the hidden one. Accept the
    // request so the bot sees success and moves on, but file it as spam.
    const isSpam = Boolean(dto.website?.trim());

    const message = await this.prisma.contactMessage.create({
      data: {
        name: dto.name.trim(),
        email: dto.email,
        phone: dto.phone?.trim() || null,
        orderNumber: dto.orderNumber?.trim() || null,
        subject: dto.subject.trim(),
        message: dto.message.trim(),
        status: isSpam ? ContactStatus.SPAM : ContactStatus.NEW,
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent?.slice(0, 500) ?? null,
      },
    });

    if (!isSpam && this.supportInbox) {
      await this.notifications
        .dispatch({
          channel: NotificationChannel.EMAIL,
          template: 'support.contact_received',
          recipient: this.supportInbox,
          payload: {
            name: message.name,
            email: message.email,
            phone: message.phone ?? '-',
            orderNumber: message.orderNumber ?? '-',
            subject: message.subject,
            message: message.message,
          },
        })
        // The customer's message is already saved; failing to alert the team is
        // a monitoring problem, not a reason to show them an error.
        .catch((err) =>
          this.logger.error(`Could not alert support about ${message.id}: ${err.message}`),
        );
    }

    this.logger.log(`Contact message ${message.id} received from ${message.email}`);
    return { id: message.id, received: true };
  }

  async findAll(query: AdminContactQueryDto) {
    const where: Prisma.ContactMessageWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' as const } },
              { subject: { contains: query.search, mode: 'insensitive' as const } },
              { orderNumber: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.contactMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: skipOf(query),
        take: query.limit,
      }),
      this.prisma.contactMessage.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }

  async update(id: string, dto: UpdateContactMessageDto, actorUserId: string) {
    return this.prisma.contactMessage.update({
      where: { id },
      data: {
        status: dto.status,
        staffNote: dto.staffNote ?? undefined,
        handledByUserId: actorUserId,
        handledAt: new Date(),
      },
    });
  }
}
