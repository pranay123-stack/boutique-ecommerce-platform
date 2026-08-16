// Loaded first so env vars are available to decorators evaluated at import
// time (see common/auth-throttle.ts), before any other module is required.
import 'dotenv/config';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { json, urlencoded, static as expressStatic } from 'express';
import { resolve } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = app.get(Logger);
  app.useLogger(logger);

  const port = config.get<number>('app.port') ?? 4100;
  const apiPrefix = config.get<string>('app.apiPrefix') ?? 'api/v1';
  const isProduction = config.get<boolean>('app.isProduction') ?? false;
  const corsOrigins = config.get<string[]>('app.corsOrigins') ?? [];

  // Behind nginx / an ALB / Cloudflare every request arrives from the proxy's
  // address. Without this the rate limiter treats the entire customer base as
  // a single client and starts returning 429 to everyone once the shared quota
  // is spent - a total outage that only appears under real traffic.
  // TRUST_PROXY is the number of proxy hops to trust (0 disables).
  const trustProxy = Number(process.env.TRUST_PROXY ?? 0);
  if (trustProxy > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', trustProxy);
    logger.log(`Trusting ${trustProxy} proxy hop(s) for client IP resolution`);
  }

  // ------------------------------------------------------------- security
  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              imgSrc: ["'self'", 'data:', 'https:'],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
            },
          }
        : false, // Swagger UI needs inline assets in development.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: isProduction ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  app.enableCors({
    origin: corsOrigins.length ? corsOrigins : true,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-CSRF-Token',
      'X-Session-Id',
      'X-Request-Id',
      'Idempotency-Key',
    ],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86_400,
  });

  app.use(cookieParser(config.get<string>('auth.cookieSecret')));
  app.use(compression());

  // Payment webhooks are signature-verified over the exact bytes received, so
  // the raw body must be preserved before JSON parsing rewrites it.
  app.use(
    json({
      limit: '1mb',
      verify: (req: any, _res, buf) => {
        if (req.originalUrl?.includes('/webhooks/')) req.rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: '1mb' }));

  // Locally-stored uploads. In production STORAGE_DRIVER=s3 serves these from
  // object storage/CDN instead and this route is unused.
  if (config.get<string>('storage.driver') === 'local') {
    app.use(
      '/static',
      expressStatic(resolve(config.get<string>('storage.localPath') ?? './uploads'), {
        maxAge: '30d',
        index: false,
        dotfiles: 'deny',
      }),
    );
  }

  app.setGlobalPrefix(apiPrefix, {
    exclude: [
      { path: 'health/live', method: 0 },
      { path: 'health/ready', method: 0 },
    ],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: false as never });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties
      forbidNonWhitelisted: true, // and reject requests that send them
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
    }),
  );

  app.enableShutdownHooks();

  // -------------------------------------------------------------- swagger
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Boutique Commerce API')
      .setDescription(
        'Production e-commerce API. Authenticate with `POST /auth/login`, then send ' +
          'the access token as `Authorization: Bearer <token>`.',
      )
      .setVersion('1.0.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
      .addCookieAuth('refreshToken')
      .addTag('Authentication')
      .addTag('Catalog')
      .addTag('Cart')
      .addTag('Orders')
      .addTag('Payments')
      .addTag('Shipping')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
      customSiteTitle: 'Boutique Commerce API',
    });
  }

  await app.listen(port, '0.0.0.0');
  logger.log(`API listening on http://localhost:${port}/${apiPrefix}`);
  if (!isProduction) logger.log(`Swagger UI at http://localhost:${port}/${apiPrefix}/docs`);
}

void bootstrap();
