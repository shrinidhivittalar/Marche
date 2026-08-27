import {
  INestApplication,
  ValidationPipe,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminController } from '../controllers/admin.controller';
import { AdminService } from '../services/admin.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

// Same pattern as marketplace.e2e.spec.ts's "PlatformRoleGuard on
// admin-only category routes" — real HTTP, real PlatformRoleGuard, only
// JwtAuthGuard stubbed. Proves @RequirePlatformRole('SUPER_ADMIN') is
// actually wired to this route, not just unit-tested on AdminService in
// isolation, and that an ADMIN (not just a plain USER) is rejected too —
// the one route in this codebase gated one level above ADMIN.
const AUTHED_USER = {
  id: 'actor_1',
  email: 'actor@example.com',
  name: 'Actor',
  role: 'CLIENT',
  platformRole: 'SUPER_ADMIN',
  capabilities: [],
};

describe('admin HTTP', () => {
  let app: INestApplication;
  let adminService: { changePlatformRole: jest.Mock };

  beforeAll(async () => {
    adminService = {
      changePlatformRole: jest.fn().mockResolvedValue({ changed: true, platformRole: 'ADMIN' }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{ provide: AdminService, useValue: adminService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          if (!req.headers.authorization) {
            throw new UnauthorizedException();
          }
          const testPlatformRole = req.headers['x-test-platform-role'];
          req.user = testPlatformRole
            ? { ...AUTHED_USER, platformRole: testPlatformRole }
            : AUTHED_USER;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    adminService.changePlatformRole.mockClear();
  });

  const patch = (id: string) =>
    request(app.getHttpServer()).patch(`/admin/users/${id}/platform-role`);

  it('rejects a plain USER with 403 before the request reaches the service', async () => {
    const res = await patch('target_1')
      .set('authorization', 'Bearer token')
      .set('x-test-platform-role', 'USER')
      .send({ platformRole: 'ADMIN' });

    expect(res.status).toBe(403);
    expect(adminService.changePlatformRole).not.toHaveBeenCalled();
  });

  it('rejects an ADMIN too — this route requires strictly SUPER_ADMIN', async () => {
    const res = await patch('target_1')
      .set('authorization', 'Bearer token')
      .set('x-test-platform-role', 'ADMIN')
      .send({ platformRole: 'ADMIN' });

    expect(res.status).toBe(403);
    expect(adminService.changePlatformRole).not.toHaveBeenCalled();
  });

  it('allows a SUPER_ADMIN through', async () => {
    const res = await patch('target_1')
      .set('authorization', 'Bearer token')
      .set('x-test-platform-role', 'SUPER_ADMIN')
      .send({ platformRole: 'ADMIN' });

    expect(res.status).toBe(200);
    expect(adminService.changePlatformRole).toHaveBeenCalledWith('actor_1', 'target_1', 'ADMIN');
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await patch('target_1').send({ platformRole: 'ADMIN' });

    expect(res.status).toBe(401);
  });

  it('rejects a body with an invalid platformRole value', async () => {
    const res = await patch('target_1')
      .set('authorization', 'Bearer token')
      .set('x-test-platform-role', 'SUPER_ADMIN')
      .send({ platformRole: 'NOT_A_ROLE' });

    expect(res.status).toBe(400);
    expect(adminService.changePlatformRole).not.toHaveBeenCalled();
  });

  it('mass assignment: an unknown field is rejected by whitelist validation', async () => {
    const res = await patch('target_1')
      .set('authorization', 'Bearer token')
      .set('x-test-platform-role', 'SUPER_ADMIN')
      .send({ platformRole: 'ADMIN', userId: 'someone-else' });

    expect(res.status).toBe(400);
  });
});
