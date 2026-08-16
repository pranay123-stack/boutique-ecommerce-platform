import type { ConfigService } from '@nestjs/config';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { buildThrottlerConfig } from './throttler.config';

const configService = (values: Record<string, unknown>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

// Stand-in for the Redis-backed store. The real one connects on construction
// and keeps the event loop alive, which would hang the suite.
const fakeStorage = () => ({}) as ThrottlerStorage;
const build = (values: Record<string, unknown>) =>
  buildThrottlerConfig(configService(values), fakeStorage);

describe('buildThrottlerConfig', () => {
  it('declares exactly one throttler', () => {
    // Regression guard. A second named throttler is applied to every request,
    // not just to the routes that reference it by name - which once capped the
    // entire API at 10 requests per minute per IP.
    const options = build({
      'throttle.ttlSeconds': 60,
      'throttle.limit': 600,
      'app.isTest': false,
    });
    expect(options.throttlers).toHaveLength(1);
    expect(options.throttlers[0]).toMatchObject({ name: 'default', ttl: 60_000, limit: 600 });
  });

  it('reads the limit and window from configuration', () => {
    const options = build({
      'throttle.ttlSeconds': 30,
      'throttle.limit': 1000,
      'app.isTest': false,
    });
    expect(options.throttlers[0]).toMatchObject({ ttl: 30_000, limit: 1000 });
  });

  it('falls back to a limit that permits ordinary browsing', () => {
    // Each storefront page view makes several API calls; too low a ceiling
    // throttles real customers, not attackers.
    const options = build({ 'app.isTest': false });
    expect(options.throttlers[0].limit).toBeGreaterThanOrEqual(300);
  });

  it('skips throttling only in the test environment', () => {
    const live = build({ 'app.isTest': false });
    const test = build({ 'app.isTest': true });
    expect(live.skipIf()).toBe(false);
    expect(test.skipIf()).toBe(true);
  });

  it('shares one quota across instances via Redis outside of tests', () => {
    // With the default in-memory store each process keeps its own tally, so
    // four instances silently permit four times the intended limit.
    expect(build({ 'app.isTest': false }).storage).toBeDefined();
    expect(build({ 'app.isTest': false, 'throttle.useRedis': false }).storage).toBeUndefined();
    expect(build({ 'app.isTest': true }).storage).toBeUndefined();
  });
});
