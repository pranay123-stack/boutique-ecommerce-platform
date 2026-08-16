// Unit tests must never touch a real service. Load deterministic test config.
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET ??= 'unit-test-access-secret-value-0123456789';
process.env.JWT_REFRESH_SECRET ??= 'unit-test-refresh-secret-value-9876543210';
process.env.DATABASE_URL ??= 'postgresql://unused:unused@localhost:1/unused';
process.env.BCRYPT_ROUNDS = '4';
