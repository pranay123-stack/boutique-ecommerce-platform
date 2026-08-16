import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Permission, RoleName } from '../constants';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';
export const PERMISSIONS_KEY = 'permissions';
export const AUDIT_KEY = 'audit';

/** Opt a route out of the globally-applied JWT guard. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);

export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export interface AuditMetadata {
  action: string;
  entityType: string;
}

/** Mark a mutating route so the AuditInterceptor records who did what. */
export const Audit = (action: string, entityType: string) =>
  SetMetadata(AUDIT_KEY, { action, entityType } satisfies AuditMetadata);

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: RoleName;
  permissions: Permission[];
}

/** Inject the authenticated principal, or a single property of it. */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);

/**
 * Guest carts are keyed by an anonymous session id carried in a cookie or the
 * X-Session-Id header, so an unauthenticated shopper keeps their cart.
 */
export const SessionId = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return (request.headers['x-session-id'] as string) ?? request.cookies?.sessionId ?? undefined;
});
