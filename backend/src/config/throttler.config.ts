import type { ConfigService } from '@nestjs/config';
import type { ThrottlerOptions } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import type { ThrottlerStorage } from '@nestjs/throttler';

/** Narrowed shape of the throttler options we actually build. */
export interface ThrottlerConfig {
  skipIf: () => boolean;
  throttlers: ThrottlerOptions[];
  storage?: ThrottlerStorage;
}

/**
 * Rate limiting baseline.
 *
 * Extracted from AppModule so the single most important invariant here can be
 * asserted by a test: there must be exactly ONE throttler.
 *
 * @nestjs/throttler evaluates every configured throttler against every
 * request. Adding a second, stricter named throttler (say a 10/min "auth" one)
 * does not scope it to auth routes - it caps the whole API at 10 requests per
 * minute per IP. Stricter limits belong on individual handlers via
 * `@Throttle({ default: { ... } })`, which overrides this baseline for that
 * route only.
 */
/**
 * Builds the shared Redis-backed storage. Injectable so tests can assert that
 * shared storage is selected without opening a socket - constructing the real
 * one connects eagerly and holds the event loop open.
 */
export type StorageFactory = (config: ConfigService) => ThrottlerStorage;

const redisStorage: StorageFactory = (config) =>
  new ThrottlerStorageRedisService({
    host: config.get<string>('redis.host'),
    port: config.get<number>('redis.port'),
    password: config.get<string>('redis.password'),
    db: config.get<number>('redis.db'),
    ...(config.get<boolean>('redis.tls') ? { tls: {} } : {}),
    maxRetriesPerRequest: 2,
  });

export function buildThrottlerConfig(
  config: ConfigService,
  createStorage: StorageFactory = redisStorage,
): ThrottlerConfig {
  // Counters live in Redis so every API instance shares one quota. With the
  // default in-memory store each process keeps its own tally, so running four
  // instances silently permits four times the intended limit - the protection
  // quietly weakens exactly as you scale out.
  const useRedis =
    config.get<boolean>('app.isTest') !== true &&
    config.get<boolean>('throttle.useRedis') !== false;

  const storage = useRedis ? createStorage(config) : undefined;

  return {
    ...(storage ? { storage } : {}),
    // Rate limiting is disabled only under NODE_ENV=test: per-route decorators
    // set hard numeric limits no environment variable can raise, so the
    // integration suite would otherwise trip its own limiter.
    skipIf: () => config.get<boolean>('app.isTest') === true,
    throttlers: [
      {
        name: 'default',
        ttl: (config.get<number>('throttle.ttlSeconds') ?? 60) * 1000,
        limit: config.get<number>('throttle.limit') ?? 600,
      },
    ],
  };
}
