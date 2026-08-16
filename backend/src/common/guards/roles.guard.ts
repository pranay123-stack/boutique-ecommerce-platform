import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, ROLES_KEY, type AuthenticatedUser } from '../decorators';
import type { Permission, RoleName } from '../constants';

/**
 * Authorisation. Runs after JwtAuthGuard has established identity.
 *
 * A route may demand a role (`@Roles`), a set of permissions
 * (`@RequirePermissions`), or both. Permissions are checked against the bundle
 * resolved from the user's role at token-issue time.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length && !requiredPermissions?.length) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user) throw new ForbiddenException('Authentication required');

    if (requiredRoles?.length && !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Insufficient role for this operation');
    }

    if (requiredPermissions?.length) {
      const held = new Set(user.permissions ?? []);
      const missing = requiredPermissions.filter((p) => !held.has(p));
      if (missing.length) {
        throw new ForbiddenException(`Missing permission(s): ${missing.join(', ')}`);
      }
    }
    return true;
  }
}
