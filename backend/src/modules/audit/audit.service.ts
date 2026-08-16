import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto, paginate } from '../../common/dto/pagination.dto';

export interface AuditRecordInput {
  actorUserId?: string;
  actorEmail?: string;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record an audit entry. Never throws - auditing is observational and must
   * not be able to roll back or fail the operation being audited.
   */
  async record(input: AuditRecordInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: input.actorUserId ?? null,
          actorEmail: input.actorEmail ?? null,
          actorRole: input.actorRole ?? null,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          before: (input.before ?? undefined) as Prisma.InputJsonValue | undefined,
          after: (input.after ?? undefined) as Prisma.InputJsonValue | undefined,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent?.slice(0, 512) ?? null,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to write audit log: ${(err as Error).message}`);
    }
  }

  async findAll(
    query: PaginationQueryDto & {
      entityType?: string;
      entityId?: string;
      actorUserId?: string;
      action?: string;
    },
  ) {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.action ? { action: { contains: query.action, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }
}
