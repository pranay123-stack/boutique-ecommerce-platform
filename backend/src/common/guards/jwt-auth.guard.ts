import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators';

/**
 * Applied globally. Routes are protected by default and must opt out with
 * `@Public()` - a safer default than remembering to guard each new route.
 *
 * Public routes still run authentication to completion so that `request.user`
 * is populated when a valid token is present. That is what lets endpoints like
 * GET /cart and POST /orders serve guests and signed-in members from the same
 * handler. The result is awaited deliberately: firing it without awaiting
 * returns before Passport has attached the user, and every "optional auth"
 * route silently degrades to anonymous.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      try {
        await super.canActivate(context);
      } catch {
        // An absent, expired or malformed token is not an error on a public
        // route - the request simply proceeds as an anonymous visitor.
      }
      return true;
    }

    return (await super.canActivate(context)) as boolean;
  }

  handleRequest<TUser>(err: unknown, user: TUser, info: unknown, context: ExecutionContext): TUser {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return user ?? (undefined as unknown as TUser);
    return super.handleRequest(err, user, info, context) as TUser;
  }
}
