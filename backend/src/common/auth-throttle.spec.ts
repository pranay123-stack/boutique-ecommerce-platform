describe('AUTH_THROTTLE', () => {
  // The module reads process.env at import time, so each case needs a fresh
  // module registry rather than a re-read of an already-evaluated constant.
  const load = (multiplier?: string): typeof import('./auth-throttle').AUTH_THROTTLE => {
    jest.resetModules();
    if (multiplier === undefined) delete process.env.AUTH_THROTTLE_MULTIPLIER;
    else process.env.AUTH_THROTTLE_MULTIPLIER = multiplier;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./auth-throttle').AUTH_THROTTLE;
  };

  afterAll(() => delete process.env.AUTH_THROTTLE_MULTIPLIER);

  it('ships strict defaults', () => {
    const t = load();
    expect(t.login).toEqual({ limit: 10, ttl: 60_000 });
    expect(t.register).toEqual({ limit: 5, ttl: 60_000 });
    expect(t.forgotPassword).toEqual({ limit: 3, ttl: 60_000 });
    expect(t.resendVerification).toEqual({ limit: 3, ttl: 300_000 });
  });

  it('scales when a harness raises the multiplier', () => {
    const t = load('100');
    expect(t.login.limit).toBe(1000);
    expect(t.register.limit).toBe(500);
  });

  it('never lets the multiplier weaken the defaults below 1x', () => {
    // A stray 0 or negative value must not disable rate limiting entirely.
    expect(load('0').login.limit).toBe(10);
    expect(load('-5').login.limit).toBe(10);
    expect(load('not-a-number').login.limit).toBe(10);
  });
});
