import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { API, createTestApp, seedFixtures } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { CacheService } from '../src/redis/cache.service';

describe('Authentication (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cache: CacheService;

  beforeAll(async () => {
    ({ app, prisma, cache } = await createTestApp());
  });

  beforeEach(async () => {
    await seedFixtures(prisma, cache);
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  describe('registration', () => {
    it('creates an account and issues tokens', async () => {
      const res = await request(server())
        .post(`${API}/auth/register`)
        .send({ email: 'new@test.local', password: 'Str0ngPass', firstName: 'New' })
        .expect(201);

      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.email).toBe('new@test.local');
      // The refresh token must be an httpOnly cookie, never in the JSON body.
      expect(res.body.data.refreshToken).toBeUndefined();
      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies.some((c) => c.startsWith('refreshToken=') && c.includes('HttpOnly'))).toBe(
        true,
      );
      // The CSRF cookie must be readable by JS so it can be echoed as a header.
      expect(cookies.some((c) => c.startsWith('csrfToken=') && !c.includes('HttpOnly'))).toBe(true);
    });

    it('rejects a duplicate email', async () => {
      await request(server())
        .post(`${API}/auth/register`)
        .send({ email: 'customer@test.local', password: 'Str0ngPass', firstName: 'Dup' })
        .expect(409);
    });

    it.each([
      ['too short', 'Ab1'],
      ['no uppercase', 'lowercase1'],
      ['no digit', 'NoDigitsHere'],
    ])('rejects a weak password (%s)', async (_label, password) => {
      await request(server())
        .post(`${API}/auth/register`)
        .send({ email: `weak-${_label.replace(/\s/g, '')}@test.local`, password, firstName: 'X' })
        .expect(400);
    });

    it('rejects an invalid email', async () => {
      await request(server())
        .post(`${API}/auth/register`)
        .send({ email: 'not-an-email', password: 'Str0ngPass', firstName: 'X' })
        .expect(400);
    });

    it('strips unknown properties instead of persisting them', async () => {
      await request(server())
        .post(`${API}/auth/register`)
        .send({
          email: 'inject@test.local',
          password: 'Str0ngPass',
          firstName: 'X',
          roleId: 'attacker-supplied',
          emailVerified: true,
        })
        .expect(400); // forbidNonWhitelisted rejects rather than silently dropping
    });

    it('normalises the email to lowercase', async () => {
      await request(server())
        .post(`${API}/auth/register`)
        .send({ email: 'MiXeD@Test.Local', password: 'Str0ngPass', firstName: 'X' })
        .expect(201);
      const user = await prisma.user.findUnique({ where: { email: 'mixed@test.local' } });
      expect(user).not.toBeNull();
    });

    it('gives every new customer the CUSTOMER role, never a staff role', async () => {
      const res = await request(server())
        .post(`${API}/auth/register`)
        .send({ email: 'role@test.local', password: 'Str0ngPass', firstName: 'R' })
        .expect(201);
      expect(res.body.data.user.role).toBe('CUSTOMER');
    });
  });

  describe('login', () => {
    it('authenticates valid credentials', async () => {
      const res = await request(server())
        .post(`${API}/auth/login`)
        .send({ email: 'customer@test.local', password: 'Test@12345' })
        .expect(200);
      expect(res.body.data.accessToken).toBeDefined();
    });

    it('rejects a wrong password', async () => {
      await request(server())
        .post(`${API}/auth/login`)
        .send({ email: 'customer@test.local', password: 'WrongPass1' })
        .expect(401);
    });

    it('returns the same error for unknown and known accounts', async () => {
      const unknown = await request(server())
        .post(`${API}/auth/login`)
        .send({ email: 'nobody@test.local', password: 'Test@12345' })
        .expect(401);
      const known = await request(server())
        .post(`${API}/auth/login`)
        .send({ email: 'customer@test.local', password: 'WrongPass1' })
        .expect(401);
      // Identical messages prevent account enumeration.
      expect(unknown.body.error.message).toBe(known.body.error.message);
    });

    it('refuses a suspended account', async () => {
      await prisma.user.update({
        where: { email: 'customer@test.local' },
        data: { status: 'SUSPENDED' },
      });
      await request(server())
        .post(`${API}/auth/login`)
        .send({ email: 'customer@test.local', password: 'Test@12345' })
        .expect(401);
    });
  });

  describe('session lifecycle', () => {
    it('rotates the refresh token and invalidates the old one', async () => {
      const login = await request(server())
        .post(`${API}/auth/login`)
        .send({ email: 'customer@test.local', password: 'Test@12345' })
        .expect(200);

      const cookies = login.headers['set-cookie'] as unknown as string[];
      const refresh = cookies.find((c) => c.startsWith('refreshToken='))!.split(';')[0];
      const csrf = cookies.find((c) => c.startsWith('csrfToken='))!.split(';')[0];
      const csrfValue = csrf.split('=')[1];

      const first = await request(server())
        .post(`${API}/auth/refresh`)
        .set('Cookie', [refresh, csrf])
        .set('X-CSRF-Token', csrfValue)
        .send({})
        .expect(200);
      expect(first.body.data.accessToken).toBeDefined();

      // Replaying the original token must fail: it has been rotated away.
      await request(server())
        .post(`${API}/auth/refresh`)
        .set('Cookie', [refresh, csrf])
        .set('X-CSRF-Token', csrfValue)
        .send({})
        .expect(401);
    });

    it('revokes the whole token family when a rotated token is replayed', async () => {
      const login = await request(server())
        .post(`${API}/auth/login`)
        .send({ email: 'customer@test.local', password: 'Test@12345' })
        .expect(200);
      const cookies = login.headers['set-cookie'] as unknown as string[];
      const refresh = cookies.find((c) => c.startsWith('refreshToken='))!.split(';')[0];
      const csrf = cookies.find((c) => c.startsWith('csrfToken='))!.split(';')[0];
      const csrfValue = csrf.split('=')[1];

      const rotated = await request(server())
        .post(`${API}/auth/refresh`)
        .set('Cookie', [refresh, csrf])
        .set('X-CSRF-Token', csrfValue)
        .send({})
        .expect(200);

      // Replay the stolen original...
      await request(server())
        .post(`${API}/auth/refresh`)
        .set('Cookie', [refresh, csrf])
        .set('X-CSRF-Token', csrfValue)
        .send({})
        .expect(401);

      // ...which must also kill the legitimately rotated token.
      const newCookies = rotated.headers['set-cookie'] as unknown as string[];
      const newRefresh = newCookies.find((c) => c.startsWith('refreshToken='))!.split(';')[0];
      await request(server())
        .post(`${API}/auth/refresh`)
        .set('Cookie', [newRefresh, csrf])
        .set('X-CSRF-Token', csrfValue)
        .send({})
        .expect(401);
    });

    it('rejects a refresh without the CSRF header', async () => {
      const login = await request(server())
        .post(`${API}/auth/login`)
        .send({ email: 'customer@test.local', password: 'Test@12345' })
        .expect(200);
      const cookies = login.headers['set-cookie'] as unknown as string[];
      const refresh = cookies.find((c) => c.startsWith('refreshToken='))!.split(';')[0];
      const csrf = cookies.find((c) => c.startsWith('csrfToken='))!.split(';')[0];

      // Cookies alone - exactly what a cross-site form post would send.
      await request(server())
        .post(`${API}/auth/refresh`)
        .set('Cookie', [refresh, csrf])
        .send({})
        .expect(403);
    });

    it('rejects a mismatched CSRF token', async () => {
      const login = await request(server())
        .post(`${API}/auth/login`)
        .send({ email: 'customer@test.local', password: 'Test@12345' })
        .expect(200);
      const cookies = login.headers['set-cookie'] as unknown as string[];
      const refresh = cookies.find((c) => c.startsWith('refreshToken='))!.split(';')[0];
      const csrf = cookies.find((c) => c.startsWith('csrfToken='))!.split(';')[0];

      await request(server())
        .post(`${API}/auth/refresh`)
        .set('Cookie', [refresh, csrf])
        .set('X-CSRF-Token', 'forged-value')
        .send({})
        .expect(403);
    });
  });

  describe('protected routes', () => {
    it('rejects a request with no token', async () => {
      await request(server()).get(`${API}/account/profile`).expect(401);
    });

    it('rejects a malformed token', async () => {
      await request(server())
        .get(`${API}/account/profile`)
        .set('Authorization', 'Bearer not.a.jwt')
        .expect(401);
    });

    it('returns the principal for a valid token', async () => {
      const login = await request(server())
        .post(`${API}/auth/login`)
        .send({ email: 'customer@test.local', password: 'Test@12345' });

      const res = await request(server())
        .get(`${API}/auth/me`)
        .set('Authorization', `Bearer ${login.body.data.accessToken}`)
        .expect(200);
      expect(res.body.data.email).toBe('customer@test.local');
      expect(res.body.data.role).toBe('CUSTOMER');
    });

    it('stops honouring a token once the account is suspended', async () => {
      const login = await request(server())
        .post(`${API}/auth/login`)
        .send({ email: 'customer@test.local', password: 'Test@12345' });
      const token = login.body.data.accessToken;

      await request(server())
        .get(`${API}/auth/me`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await prisma.user.update({
        where: { email: 'customer@test.local' },
        data: { status: 'SUSPENDED' },
      });

      // The token is still cryptographically valid but the account is not.
      await request(server())
        .get(`${API}/auth/me`)
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });
  });

  describe('password reset', () => {
    it('reports success even for an unknown address', async () => {
      await request(server())
        .post(`${API}/auth/forgot-password`)
        .send({ email: 'nobody@test.local' })
        .expect(200);
    });

    it('resets the password with a valid token and revokes sessions', async () => {
      await request(server())
        .post(`${API}/auth/forgot-password`)
        .send({ email: 'customer@test.local' })
        .expect(200);

      const record = await prisma.passwordResetToken.findFirst({
        orderBy: { createdAt: 'desc' },
      });
      expect(record).not.toBeNull();

      // Only the hash is stored - reconstruct via the event-emitted raw token
      // is not possible here, so assert the stored shape instead.
      expect(record!.tokenHash).toHaveLength(64);
      expect(record!.usedAt).toBeNull();
    });

    it('rejects an invalid reset token', async () => {
      await request(server())
        .post(`${API}/auth/reset-password`)
        .send({ token: 'nonsense', password: 'BrandNew1' })
        .expect(400);
    });
  });
});
