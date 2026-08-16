import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorResult,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { Public } from '../../common/decorators';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Liveness: is the process up? Used by orchestrators to decide on restarts. */
  @Get('live')
  @Public()
  @ApiOperation({ summary: 'Liveness probe' })
  live() {
    return { status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() };
  }

  /** Readiness: can we actually serve traffic? Checks real dependencies. */
  @Get('ready')
  @Public()
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe - verifies database and cache' })
  ready() {
    return this.health.check([
      async (): Promise<HealthIndicatorResult> => {
        const started = Date.now();
        try {
          await this.prisma.$queryRaw`SELECT 1`;
          return { database: { status: 'up', responseTimeMs: Date.now() - started } };
        } catch (err) {
          return {
            database: { status: 'down', message: (err as Error).message },
          };
        }
      },
      async (): Promise<HealthIndicatorResult> => {
        // Redis is a soft dependency: degraded, not down.
        const ok = await this.redis.ping();
        return { cache: { status: ok ? 'up' : 'down', degraded: !ok } };
      },
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),
    ]);
  }
}
