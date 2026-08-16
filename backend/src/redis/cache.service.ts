import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

/**
 * Application cache.
 *
 * Design rule: the cache is *always* optional. Every method degrades to a
 * direct miss when Redis is down, so an outage in the cache tier slows the
 * storefront but never breaks it.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly defaultTtl: number;
  private readonly prefix = 'boutique:';

  constructor(
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.defaultTtl = config.get<number>('redis.cacheTtlSeconds') ?? 300;
  }

  private key(k: string): string {
    return `${this.prefix}${k}`;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.redis.isAvailable()) return null;
    try {
      const raw = await this.redis.client.get(this.key(key));
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      this.logger.debug(`cache get failed for ${key}: ${(err as Error).message}`);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    if (!this.redis.isAvailable()) return;
    try {
      await this.redis.client.set(
        this.key(key),
        JSON.stringify(value),
        'EX',
        ttlSeconds ?? this.defaultTtl,
      );
    } catch (err) {
      this.logger.debug(`cache set failed for ${key}: ${(err as Error).message}`);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (!this.redis.isAvailable() || keys.length === 0) return;
    try {
      await this.redis.client.del(...keys.map((k) => this.key(k)));
    } catch (err) {
      this.logger.debug(`cache del failed: ${(err as Error).message}`);
    }
  }

  /**
   * Invalidate by pattern using SCAN. We deliberately avoid the KEYS command,
   * which blocks the Redis event loop and is a well-known production footgun.
   */
  async delPattern(pattern: string): Promise<number> {
    if (!this.redis.isAvailable()) return 0;
    let cursor = '0';
    let removed = 0;
    const match = this.key(pattern);
    try {
      do {
        const [next, found] = await this.redis.client.scan(cursor, 'MATCH', match, 'COUNT', 200);
        cursor = next;
        if (found.length) {
          await this.redis.client.del(...found);
          removed += found.length;
        }
      } while (cursor !== '0');
    } catch (err) {
      this.logger.debug(`cache delPattern failed: ${(err as Error).message}`);
    }
    return removed;
  }

  /** Read-through helper: return the cached value or compute, store and return. */
  async wrap<T>(key: string, ttlSeconds: number, producer: () => Promise<T>): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== null) return hit;
    const value = await producer();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * Best-effort distributed lock (SET NX PX). Used to keep duplicated webhook
   * deliveries and concurrent stock reservations from racing each other.
   */
  async acquireLock(name: string, ttlMs = 10_000): Promise<string | null> {
    if (!this.redis.isAvailable()) return 'no-redis';
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ok = await this.redis.client.set(this.key(`lock:${name}`), token, 'PX', ttlMs, 'NX');
    return ok ? token : null;
  }

  async releaseLock(name: string, token: string): Promise<void> {
    if (!this.redis.isAvailable() || token === 'no-redis') return;
    // Compare-and-delete so we never release a lock another worker now owns.
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else return 0 end`;
    try {
      await this.redis.client.eval(script, 1, this.key(`lock:${name}`), token);
    } catch {
      /* lock will expire on its own */
    }
  }
}
