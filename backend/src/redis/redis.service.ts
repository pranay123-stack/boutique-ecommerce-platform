import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  public readonly client: Redis;
  private available = false;

  constructor(private readonly config: ConfigService) {
    this.client = new Redis({
      host: this.config.get<string>('redis.host'),
      port: this.config.get<number>('redis.port'),
      password: this.config.get<string>('redis.password'),
      db: this.config.get<number>('redis.db'),
      tls: this.config.get<boolean>('redis.tls') ? {} : undefined,
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy: (times) => Math.min(times * 200, 3000),
    });

    this.client.on('error', (err) => {
      // Redis is a performance layer, never a correctness dependency. A dropped
      // connection degrades us to direct database reads instead of erroring.
      if (this.available) {
        this.logger.error(`Redis connection error: ${err.message}`);
        this.available = false;
      }
    });
    this.client.on('ready', () => {
      this.available = true;
      this.logger.log('Redis connection established');
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
    } catch (err) {
      this.logger.warn(
        `Redis unavailable at startup (${(err as Error).message}). ` +
          'Continuing with cache disabled.',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }

  isAvailable(): boolean {
    return this.available && this.client.status === 'ready';
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
}
