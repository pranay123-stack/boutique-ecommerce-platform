import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import { Prisma, ProductStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CacheService } from '../src/redis/cache.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ROLES, ROLE_PERMISSIONS } from '../src/common/constants';

/**
 * Boots the real application module against the test database.
 *
 * Deliberately mirrors main.ts (same pipes, same filter, same prefix) so that
 * integration tests exercise the request pipeline the production server uses,
 * rather than a simplified stand-in that would hide middleware bugs.
 */
export async function createTestApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
  cache: CacheService;
}> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication({ logger: false });
  const config = app.get(ConfigService);

  app.use(cookieParser(config.get<string>('auth.cookieSecret')));
  app.use(
    json({
      verify: (req: any, _res, buf) => {
        if (req.originalUrl?.includes('/webhooks/')) req.rawBody = Buffer.from(buf);
      },
    }),
  );
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health/live', method: 0 },
      { path: 'health/ready', method: 0 },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter(false));

  await app.init();
  return { app, prisma: app.get(PrismaService), cache: app.get(CacheService) };
}

export const API = '/api/v1';

/**
 * Deterministic fixture set, rebuilt before each test.
 *
 * The cache is flushed alongside the tables: cached product listings outlive a
 * TRUNCATE and would otherwise leak state from the previous test.
 */
export async function seedFixtures(prisma: PrismaService, cache?: CacheService) {
  await prisma.truncateAll();
  if (cache) await cache.delPattern('*');

  const roles: Record<string, string> = {};
  for (const name of Object.values(ROLES)) {
    const role = await prisma.role.create({
      data: { name, permissions: ROLE_PERMISSIONS[name], isSystem: true },
    });
    roles[name] = role.id;
  }

  const passwordHash = await bcrypt.hash('Test@12345', 4);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@test.local',
      passwordHash,
      firstName: 'Admin',
      emailVerified: true,
      roleId: roles[ROLES.ADMIN],
      wishlist: { create: {} },
    },
  });
  const customer = await prisma.user.create({
    data: {
      email: 'customer@test.local',
      passwordHash,
      firstName: 'Cust',
      lastName: 'Omer',
      emailVerified: true,
      roleId: roles[ROLES.CUSTOMER],
      wishlist: { create: {} },
    },
  });

  const category = await prisma.category.create({
    data: { name: 'Scarves', slug: 'scarves', isActive: true },
  });

  const product = await prisma.product.create({
    data: {
      name: 'Test Silk Scarf',
      slug: 'test-silk-scarf',
      description: 'A hand-rolled silk scarf used by the integration suite.',
      shortDescription: 'Hand-rolled silk',
      categoryId: category.id,
      brand: 'Atelier Test',
      status: ProductStatus.ACTIVE,
      basePrice: new Prisma.Decimal('1000.00'),
      compareAtPrice: new Prisma.Decimal('1400.00'),
      taxRatePercent: new Prisma.Decimal('5'),
      publishedAt: new Date(),
      images: { create: { url: 'http://localhost/img.svg', position: 0, isPrimary: true } },
    },
  });

  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku: 'TEST-SCARF-RED',
      name: 'Red',
      price: new Prisma.Decimal('1000.00'),
      weightGrams: 200,
      inventory: { create: { quantity: 10, lowStockThreshold: 2 } },
    },
    include: { inventory: true },
  });

  const lowStockVariant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku: 'TEST-SCARF-BLUE',
      name: 'Blue',
      price: new Prisma.Decimal('1000.00'),
      weightGrams: 200,
      position: 1,
      inventory: { create: { quantity: 1, lowStockThreshold: 5 } },
    },
    include: { inventory: true },
  });

  await prisma.coupon.createMany({
    data: [
      {
        code: 'SAVE10',
        type: 'PERCENTAGE',
        value: new Prisma.Decimal(10),
        minOrderValue: new Prisma.Decimal(0),
        usageLimitPerUser: 5,
        isActive: true,
        startsAt: new Date(Date.now() - 3600_000),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
      {
        code: 'EXPIRED',
        type: 'PERCENTAGE',
        value: new Prisma.Decimal(50),
        minOrderValue: new Prisma.Decimal(0),
        usageLimitPerUser: 5,
        isActive: true,
        startsAt: new Date(Date.now() - 86_400_000),
        expiresAt: new Date(Date.now() - 3600_000),
      },
      {
        code: 'BIGSPEND',
        type: 'FIXED',
        value: new Prisma.Decimal(500),
        minOrderValue: new Prisma.Decimal(99999),
        usageLimitPerUser: 5,
        isActive: true,
        startsAt: new Date(Date.now() - 3600_000),
      },
    ],
  });

  return { roles, admin, customer, category, product, variant, lowStockVariant };
}

export const ADDRESS = {
  fullName: 'Test Customer',
  phone: '+919876543210',
  line1: '1 Test Street',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560001',
  country: 'IN',
};
