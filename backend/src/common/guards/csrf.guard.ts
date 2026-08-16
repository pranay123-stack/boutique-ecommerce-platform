import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { safeCompare } from '../utils/crypto.util';

export const CSRF_COOKIE = 'csrfToken';
export const CSRF_HEADER = 'x-csrf-token';

/**
 * Double-submit CSRF protection for cookie-authenticated routes.
 *
 * Threat model: the refresh token lives in an httpOnly cookie, so a browser
 * will attach it to a cross-site POST automatically. Bearer-token routes are
 * not vulnerable (script cannot set Authorization cross-origin), so this guard
 * is applied only where cookies carry the credential - /auth/refresh, /logout.
 *
 * The CSRF cookie is readable by first-party JS and echoed back in a header;
 * an attacker on another origin can trigger the request but cannot read the
 * cookie to forge the matching header.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;

    const cookieToken = (request as any).cookies?.[CSRF_COOKIE] as string | undefined;
    const headerToken = request.headers[CSRF_HEADER] as string | undefined;

    if (!cookieToken || !headerToken) {
      throw new ForbiddenException('CSRF token missing');
    }
    if (!safeCompare(cookieToken, headerToken)) {
      throw new ForbiddenException('CSRF token mismatch');
    }
    return true;
  }
}
