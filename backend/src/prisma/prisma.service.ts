import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Prisma client wrapper.
 *
 * Adds two things the bare client does not give us:
 *  1. Slow-query surfacing - any statement over the threshold is logged with
 *     its duration so regressions show up in normal application logs.
 *  2. A `truncateAll()` helper used exclusively by the integration test suite
 *     to reset state between specs without paying for a full migration cycle.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private static readonly SLOW_QUERY_MS = 300;

  constructor(config: ConfigService) {
    super({
      datasources: { db: { url: config.get<string>('database.url') } },
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
      errorFormat: 'minimal',
    });

    const isTest = config.get<boolean>('app.isTest');

    // `as any` is required because Prisma's event typings are only narrowed when
    // the log config is a literal; ours comes from a variable.
    (this as any).$on('query', (e: Prisma.QueryEvent) => {
      if (e.duration >= PrismaService.SLOW_QUERY_MS && !isTest) {
        this.logger.warn(
          `Slow query ${e.duration}ms :: ${e.query.slice(0, 400)} :: params=${e.params}`,
        );
      }
    });
    (this as any).$on('error', (e: Prisma.LogEvent) => {
      this.logger.error(`Prisma error: ${e.message}`);
    });
    (this as any).$on('warn', (e: Prisma.LogEvent) => {
      this.logger.warn(`Prisma warning: ${e.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async enableShutdownHooks(app: INestApplication): Promise<void> {
    process.on('beforeExit', () => {
      void app.close();
    });
  }

  /** Test-only. Wipes every table while preserving schema and enum types. */
  async truncateAll(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('truncateAll() is only available when NODE_ENV=test');
    }
    const rows = await this.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    `;
    if (rows.length === 0) return;
    const tables = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
    await this.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
  }
}
