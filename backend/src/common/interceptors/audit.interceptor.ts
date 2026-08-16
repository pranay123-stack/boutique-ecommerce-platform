import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AUDIT_KEY, type AuditMetadata, type AuthenticatedUser } from '../decorators';
import { AuditService } from '../../modules/audit/audit.service';

/**
 * Writes an audit record for any route decorated with `@Audit(...)`.
 *
 * Audit writes are fire-and-forget: a failure to record an audit entry must
 * never fail the business operation that succeeded. Failures are logged by the
 * AuditService itself.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<AuditMetadata>(AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!meta) return next.handle();

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    return next.handle().pipe(
      tap((result) => {
        const entityId =
          (result && typeof result === 'object' && 'id' in result
            ? String((result as { id: unknown }).id)
            : undefined) ?? request.params?.id;

        void this.audit.record({
          actorUserId: user?.id,
          actorEmail: user?.email,
          actorRole: user?.role,
          action: meta.action,
          entityType: meta.entityType,
          entityId,
          after: this.redact(request.body),
          ipAddress: request.ip,
          userAgent: request.headers?.['user-agent'],
        });
      }),
    );
  }

  /** Audit logs are long-lived; secrets must never enter them. */
  private redact(body: unknown): Record<string, unknown> | undefined {
    if (!body || typeof body !== 'object') return undefined;
    const sensitive = [
      'password',
      'currentPassword',
      'newPassword',
      'token',
      'secret',
      'signature',
    ];
    const clone: Record<string, unknown> = { ...(body as Record<string, unknown>) };
    for (const key of Object.keys(clone)) {
      if (sensitive.some((s) => key.toLowerCase().includes(s))) clone[key] = '[REDACTED]';
    }
    return clone;
  }
}
