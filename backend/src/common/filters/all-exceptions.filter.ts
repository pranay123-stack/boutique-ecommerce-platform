import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

interface ErrorBody {
  success: false;
  error: { code: string; message: string; details?: unknown };
  path: string;
  timestamp: string;
  requestId?: string;
}

/**
 * Single exit point for every error the API can produce.
 *
 * Two rules it enforces:
 *  - Clients receive a stable, documented error shape.
 *  - Internal details (SQL, stack traces, driver messages) never cross the
 *    network boundary in production; they go to the logs instead.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  constructor(private readonly isProduction: boolean) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      code = this.codeForStatus(status);
      if (typeof payload === 'string') {
        message = payload;
      } else if (payload && typeof payload === 'object') {
        const p = payload as Record<string, unknown>;
        message = (p.message as string) ?? exception.message;
        if (Array.isArray(p.message)) {
          // class-validator returns an array of constraint failures.
          message = 'Validation failed';
          code = 'VALIDATION_ERROR';
          details = p.message;
        }
        if (p.code) code = p.code as string;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      ({ status, code, message, details } = this.mapPrismaError(exception));
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      code = 'INVALID_QUERY';
      message = 'The request could not be processed';
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status} ${code}: ${
          exception instanceof Error ? exception.message : String(exception)
        }`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.debug(`${request.method} ${request.url} -> ${status} ${code}: ${message}`);
    }

    // Never leak internals on a 500 in production.
    if (this.isProduction && status >= 500) {
      message = 'An unexpected error occurred';
      details = undefined;
    }

    const body: ErrorBody = {
      success: false,
      error: { code, message, ...(details ? { details } : {}) },
      path: request.url,
      timestamp: new Date().toISOString(),
      requestId: (request.headers['x-request-id'] as string) ?? undefined,
    };

    response.status(status).json(body);
  }

  private codeForStatus(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      410: 'GONE',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'RATE_LIMITED',
    };
    return map[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR');
  }

  private mapPrismaError(e: Prisma.PrismaClientKnownRequestError): {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    switch (e.code) {
      case 'P2002': {
        const target = (e.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
        return {
          status: HttpStatus.CONFLICT,
          code: 'DUPLICATE_RESOURCE',
          message: `A record with this ${target} already exists`,
        };
      }
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          code: 'NOT_FOUND',
          message: 'The requested resource was not found',
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          code: 'INVALID_REFERENCE',
          message: 'Referenced record does not exist',
        };
      case 'P2014':
        return {
          status: HttpStatus.BAD_REQUEST,
          code: 'RELATION_VIOLATION',
          message: 'This change would violate a required relation',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          code: 'DATABASE_ERROR',
          message: 'A database error occurred',
        };
    }
  }
}
