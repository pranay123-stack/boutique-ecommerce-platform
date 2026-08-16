import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { PERMISSIONS, ROLES } from '../constants';

const context = (user?: unknown) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  }) as any;

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  const require = (roles?: unknown, permissions?: unknown) => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: any) => (key === 'roles' ? roles : permissions) as any);
  };

  it('allows a route with no role or permission metadata', () => {
    require(undefined, undefined);
    expect(guard.canActivate(context())).toBe(true);
  });

  it('rejects an unauthenticated request to a guarded route', () => {
    require([ROLES.ADMIN], undefined);
    expect(() => guard.canActivate(context(undefined))).toThrow(ForbiddenException);
  });

  it('allows a matching role', () => {
    require([ROLES.ADMIN], undefined);
    expect(guard.canActivate(context({ role: ROLES.ADMIN, permissions: [] }))).toBe(true);
  });

  it('rejects a non-matching role', () => {
    require([ROLES.ADMIN], undefined);
    expect(() => guard.canActivate(context({ role: ROLES.CUSTOMER, permissions: [] }))).toThrow(
      /Insufficient role/,
    );
  });

  it('allows when every required permission is held', () => {
    require(undefined, [PERMISSIONS.PRODUCT_WRITE]);
    expect(
      guard.canActivate(context({ role: ROLES.MANAGER, permissions: [PERMISSIONS.PRODUCT_WRITE] })),
    ).toBe(true);
  });

  it('names the missing permission when rejecting', () => {
    require(undefined, [PERMISSIONS.ORDER_REFUND]);
    expect(() =>
      guard.canActivate(context({ role: ROLES.SUPPORT, permissions: [PERMISSIONS.ORDER_READ] })),
    ).toThrow(/order:refund/);
  });

  it('requires ALL listed permissions, not just one', () => {
    require(undefined, [PERMISSIONS.ORDER_READ, PERMISSIONS.ORDER_REFUND]);
    expect(() =>
      guard.canActivate(context({ role: ROLES.SUPPORT, permissions: [PERMISSIONS.ORDER_READ] })),
    ).toThrow(ForbiddenException);
  });

  it('treats a user with no permissions array as holding none', () => {
    require(undefined, [PERMISSIONS.PRODUCT_READ]);
    expect(() => guard.canActivate(context({ role: ROLES.CUSTOMER }))).toThrow(ForbiddenException);
  });
});
