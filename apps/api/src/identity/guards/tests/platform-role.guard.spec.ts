import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformRoleGuard } from '../platform-role.guard';
import { PLATFORM_ROLE_KEY } from '../../decorators/require-platform-role.decorator';
import type { AuthenticatedUser } from '../../strategies/jwt.strategy';

function contextWithUser(user: Partial<AuthenticatedUser> | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => ({}),
  } as unknown as ExecutionContext;
}

function reflectorReturning(required: string | undefined) {
  return { get: jest.fn().mockReturnValue(required) } as unknown as Reflector;
}

describe('PlatformRoleGuard', () => {
  it('allows the request through when the route has no @RequirePlatformRole at all', () => {
    const guard = new PlatformRoleGuard(reflectorReturning(undefined));
    expect(guard.canActivate(contextWithUser(undefined))).toBe(true);
  });

  it('rejects a USER against an ADMIN-required route', () => {
    const guard = new PlatformRoleGuard(reflectorReturning('ADMIN'));
    expect(() => guard.canActivate(contextWithUser({ platformRole: 'USER' }))).toThrow(
      ForbiddenException,
    );
  });

  it('allows an ADMIN through an ADMIN-required route', () => {
    const guard = new PlatformRoleGuard(reflectorReturning('ADMIN'));
    expect(guard.canActivate(contextWithUser({ platformRole: 'ADMIN' }))).toBe(true);
  });

  it('allows a SUPER_ADMIN through an ADMIN-required route — a strict superset, not a separate permission', () => {
    const guard = new PlatformRoleGuard(reflectorReturning('ADMIN'));
    expect(guard.canActivate(contextWithUser({ platformRole: 'SUPER_ADMIN' }))).toBe(true);
  });

  it('rejects an ADMIN against a SUPER_ADMIN-required route', () => {
    const guard = new PlatformRoleGuard(reflectorReturning('SUPER_ADMIN'));
    expect(() => guard.canActivate(contextWithUser({ platformRole: 'ADMIN' }))).toThrow(
      ForbiddenException,
    );
  });

  it('allows a SUPER_ADMIN through a SUPER_ADMIN-required route', () => {
    const guard = new PlatformRoleGuard(reflectorReturning('SUPER_ADMIN'));
    expect(guard.canActivate(contextWithUser({ platformRole: 'SUPER_ADMIN' }))).toBe(true);
  });

  it('rejects when request.user is missing entirely — cannot be bypassed by an absent user object', () => {
    const guard = new PlatformRoleGuard(reflectorReturning('ADMIN'));
    expect(() => guard.canActivate(contextWithUser(undefined))).toThrow(ForbiddenException);
  });

  it('rejects when platformRole is missing from request.user — cannot be bypassed by omitting the field', () => {
    const guard = new PlatformRoleGuard(reflectorReturning('ADMIN'));
    expect(() => guard.canActivate(contextWithUser({ platformRole: undefined } as never))).toThrow(
      ForbiddenException,
    );
  });

  it('is driven entirely by request.user.platformRole, never by request.user.role (the legacy field)', () => {
    // A user whose legacy role happens to be the string 'ADMIN' but whose
    // platformRole (the value JwtStrategy actually loads fresh from the
    // database) is USER must still be rejected — this is the guard's core
    // guarantee against any lingering assumption that the old role scalar
    // means anything for platform authority.
    const guard = new PlatformRoleGuard(reflectorReturning('ADMIN'));
    expect(() =>
      guard.canActivate(contextWithUser({ role: 'ADMIN', platformRole: 'USER' } as never)),
    ).toThrow(ForbiddenException);
  });

  it('reads the required role from the handler metadata key the decorator sets', () => {
    const reflector = reflectorReturning('ADMIN');
    const guard = new PlatformRoleGuard(reflector);
    const context = contextWithUser({ platformRole: 'ADMIN' });

    guard.canActivate(context);

    expect(reflector.get).toHaveBeenCalledWith(PLATFORM_ROLE_KEY, context.getHandler());
  });
});
