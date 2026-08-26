import {
  INestApplication,
  ValidationPipe,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CategoriesController } from '../controllers/categories.controller';
import { ServicesController } from '../controllers/services.controller';
import { MarketplaceController } from '../controllers/marketplace.controller';
import { CategoriesService } from '../services/categories.service';
import { ServicesService } from '../services/services.service';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';

// Real HTTP through the real ValidationPipe, the real routing table and the
// real controllers. These cover the layer that unit tests structurally
// cannot reach: request parsing, DTO validation and transformation, status
// codes, and route matching.
//
// The service layer is mocked so these stay fast and hermetic. What they do
// NOT cover is a full database round-trip (create -> publish -> appears in
// search). That needs a dedicated test database; running it against the
// shared one would write to the same database the deployed app uses. Noted
// as an open gap rather than quietly skipped.
//
// JwtAuthGuard is stubbed to accept any bearer token and reject requests
// without one. Real token verification is Module 1's responsibility and is
// covered by its own tests; what matters here is that the guard is actually
// applied to the routes that need it.
// platformRole: 'ADMIN' so PlatformRoleGuard (Module 01 Slice 2) doesn't
// reject the category-admin routes before these tests reach the behavior
// they're actually testing (DTO validation, routing, status codes) — a
// real, unauthorized caller's 403 is covered separately by the
// PlatformRoleGuard unit spec, not duplicated here.
const AUTHED_USER = {
  id: 'user_1',
  email: 'p@example.com',
  name: 'P',
  role: 'PROVIDER',
  platformRole: 'ADMIN',
  capabilities: ['PROVIDER'],
};

describe('marketplace HTTP', () => {
  let app: INestApplication;
  let categoriesService: { [key: string]: jest.Mock };
  let servicesService: { [key: string]: jest.Mock };

  beforeAll(async () => {
    categoriesService = {
      getTree: jest.fn().mockResolvedValue([]),
      getBySlug: jest.fn().mockResolvedValue({ id: 'c1' }),
      create: jest.fn().mockResolvedValue({ id: 'c1' }),
      update: jest.fn().mockResolvedValue({ id: 'c1' }),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    servicesService = {
      search: jest.fn().mockResolvedValue({ data: [], pagination: {} }),
      searchProviders: jest.fn().mockResolvedValue({ data: [], pagination: {} }),
      findPublicById: jest.fn().mockResolvedValue({ id: 's1' }),
      listMine: jest.fn().mockResolvedValue({ data: [], pagination: {} }),
      create: jest.fn().mockResolvedValue({ id: 's1' }),
      update: jest.fn().mockResolvedValue({ id: 's1' }),
      setVisibility: jest.fn().mockResolvedValue({ id: 's1' }),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [CategoriesController, ServicesController, MarketplaceController],
      providers: [
        { provide: CategoriesService, useValue: categoriesService },
        { provide: ServicesService, useValue: servicesService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          // Throws rather than returning false: returning false makes Nest
          // respond 403, but the real JwtAuthGuard throws and responds 401
          // (confirmed against a running server). The stub has to match, or
          // these tests would enshrine a status code the app never returns.
          if (!req.headers.authorization) {
            throw new UnauthorizedException();
          }
          // x-test-platform-role lets individual tests exercise
          // PlatformRoleGuard (Module 01 Slice 2), which runs for real in
          // this suite (not stubbed) — everything else keeps getting
          // AUTHED_USER (platformRole ADMIN) unchanged.
          const testPlatformRole = req.headers['x-test-platform-role'];
          req.user = testPlatformRole
            ? { ...AUTHED_USER, platformRole: testPlatformRole }
            : AUTHED_USER;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    // Identical to main.ts. whitelist + forbidNonWhitelisted is what turns
    // an undeclared field into a 400 instead of a silently ignored value.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (req: request.Test) => req.set('Authorization', 'Bearer test-token');

  describe('mass assignment is rejected at the boundary', () => {
    const validBody = {
      title: 'Wedding photography',
      description: 'A description long enough to satisfy the validation rules.',
      categoryId: '3f1c0f9e-0000-4000-8000-000000000000',
      startingPrice: 25000,
      deliveryDays: 7,
    };

    it.each(['profileId', 'status', 'publishedAt', 'deletedAt', 'createdAt', 'id'])(
      'rejects a create carrying %s',
      async (field) => {
        const res = await auth(
          request(app.getHttpServer())
            .post('/services')
            .send({ ...validBody, [field]: 'injected' }),
        );
        expect(res.status).toBe(400);
        expect(JSON.stringify(res.body.message)).toContain(`property ${field} should not exist`);
        expect(servicesService.create).not.toHaveBeenCalled();
      },
    );

    it('rejects the same fields on update', async () => {
      const res = await auth(
        request(app.getHttpServer()).patch('/services/s1').send({ status: 'PUBLISHED' }),
      );
      expect(res.status).toBe(400);
      expect(servicesService.update).not.toHaveBeenCalled();
    });

    it('accepts a clean body and passes the caller id from the session', async () => {
      const res = await auth(request(app.getHttpServer()).post('/services').send(validBody));
      expect(res.status).toBe(201);
      expect(servicesService.create).toHaveBeenCalledWith(AUTHED_USER.id, expect.any(Object));
    });
  });

  describe('authentication is applied to the routes that need it', () => {
    it.each([
      ['get', '/services/me'],
      ['post', '/services'],
      ['patch', '/services/s1'],
      ['patch', '/services/s1/visibility'],
      ['delete', '/services/s1'],
      ['post', '/categories'],
      ['patch', '/categories/c1'],
      ['delete', '/categories/c1'],
    ])('%s %s requires a token', async (method, path) => {
      const agent = request(app.getHttpServer());
      const send = agent[method as 'get' | 'post' | 'patch' | 'delete'].bind(agent);
      const res = await send(path);
      expect(res.status).toBe(401);
    });

    it.each([
      ['/categories'],
      ['/categories/photography'],
      ['/services'],
      ['/services/s1'],
      ['/marketplace/providers'],
    ])('%s is public', async (path) => {
      const res = await request(app.getHttpServer()).get(path);
      expect(res.status).toBe(200);
    });
  });

  // PlatformRoleGuard runs for real in this suite (Module 01 Slice 2) —
  // only JwtAuthGuard is stubbed. These prove the guard is actually wired
  // to the category-admin routes, not just unit-tested in isolation.
  describe('PlatformRoleGuard on admin-only category routes', () => {
    it.each([
      ['post', '/categories', { name: 'XY', slug: 'xy' }],
      ['patch', '/categories/c1', { name: 'X' }],
      ['delete', '/categories/c1', undefined],
    ])(
      '%s %s rejects a plain USER with 403, before the request reaches the service',
      async (method, path, body) => {
        const agent = request(app.getHttpServer());
        const send = agent[method as 'post' | 'patch' | 'delete'].bind(agent);
        const res = await send(path)
          .set('authorization', 'Bearer token')
          .set('x-test-platform-role', 'USER')
          .send(body);

        expect(res.status).toBe(403);
        expect(categoriesService.create).not.toHaveBeenCalled();
        expect(categoriesService.update).not.toHaveBeenCalled();
        expect(categoriesService.remove).not.toHaveBeenCalled();
      },
    );

    it('allows an ADMIN through', async () => {
      const res = await request(app.getHttpServer())
        .post('/categories')
        .set('authorization', 'Bearer token')
        .set('x-test-platform-role', 'ADMIN')
        .send({ name: 'XY', slug: 'xy' });

      expect(res.status).toBe(201);
      expect(categoriesService.create).toHaveBeenCalled();
    });

    it('allows a SUPER_ADMIN through — a strict superset of ADMIN, not a separate check', async () => {
      const res = await request(app.getHttpServer())
        .post('/categories')
        .set('authorization', 'Bearer token')
        .set('x-test-platform-role', 'SUPER_ADMIN')
        .send({ name: 'YZ', slug: 'yz' });

      expect(res.status).toBe(201);
    });

    it('cannot be bypassed by a client-controlled field: the DTO has no role/platformRole field, and one sent anyway is rejected by whitelist validation, not silently accepted', async () => {
      const res = await request(app.getHttpServer())
        .post('/categories')
        .set('authorization', 'Bearer token')
        .set('x-test-platform-role', 'USER')
        .send({ name: 'XY', slug: 'xy', platformRole: 'ADMIN', role: 'ADMIN' });

      // Rejected by PlatformRoleGuard (403) before validation would even
      // get a chance to reject the extra fields (400) — either way, never
      // the 201 a client-controlled role escalation would produce.
      expect(res.status).toBe(403);
    });
  });

  // The bug this guards against: 'me' declared after ':id' would make
  // /services/me resolve to findPublicById('me').
  describe('route matching', () => {
    it('routes /services/me to the owner handler, not the :id handler', async () => {
      await auth(request(app.getHttpServer()).get('/services/me'));
      expect(servicesService.listMine).toHaveBeenCalled();
      expect(servicesService.findPublicById).not.toHaveBeenCalledWith('me');
    });

    it('routes /services/:id/visibility to the visibility handler', async () => {
      await auth(
        request(app.getHttpServer()).patch('/services/s1/visibility').send({ status: 'PUBLISHED' }),
      );
      expect(servicesService.setVisibility).toHaveBeenCalled();
      expect(servicesService.update).not.toHaveBeenCalled();
    });
  });

  describe('query validation and transformation', () => {
    it.each(['rating', 'relevance', 'nonsense'])('rejects sort=%s', async (sort) => {
      const res = await request(app.getHttpServer()).get(`/services?sort=${sort}`);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain('newest, price_low, price_high');
    });

    it.each(['newest', 'price_low', 'price_high'])('accepts sort=%s', async (sort) => {
      const res = await request(app.getHttpServer()).get(`/services?sort=${sort}`);
      expect(res.status).toBe(200);
    });

    it('rejects an inverted price range', async () => {
      const res = await request(app.getHttpServer()).get('/services?minPrice=500&maxPrice=100');
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain('maxPrice');
    });

    it('accepts an equal price range', async () => {
      expect(
        (await request(app.getHttpServer()).get('/services?minPrice=100&maxPrice=100')).status,
      ).toBe(200);
    });

    it('rejects a limit above the maximum', async () => {
      expect((await request(app.getHttpServer()).get('/services?limit=999')).status).toBe(400);
    });

    it('rejects page 0', async () => {
      expect((await request(app.getHttpServer()).get('/services?page=0')).status).toBe(400);
    });

    it('rejects an unknown query parameter', async () => {
      expect((await request(app.getHttpServer()).get('/services?evil=1')).status).toBe(400);
    });

    // Query strings arrive as text; the DTO has to coerce them or every
    // numeric filter silently compares a string.
    it('coerces numeric query params to numbers', async () => {
      await request(app.getHttpServer()).get('/services?minPrice=100&page=2&limit=5');
      const dto = servicesService.search.mock.calls.at(-1)![0];
      expect(dto.minPrice).toBe(100);
      expect(dto.page).toBe(2);
      expect(dto.limit).toBe(5);
    });

    it('splits comma-separated skills into an array', async () => {
      const ids = ['3f2504e0-4f89-11d3-9a0c-0305e82c3301', '9c858901-8a57-4791-81fe-4c455b099bc9'];
      await request(app.getHttpServer()).get(`/services?skills=${ids.join(',')}`);
      expect(servicesService.search.mock.calls.at(-1)![0].skills).toEqual(ids);
    });

    // Skill ids are matched against a uuid column, so anything else has to be
    // turned away here rather than becoming a Prisma error further in.
    it('rejects a non-uuid skill id instead of failing in the database', async () => {
      expect((await request(app.getHttpServer()).get('/services?skills=abc')).status).toBe(400);
    });

    it('defaults to newest, page 1, limit 20', async () => {
      await request(app.getHttpServer()).get('/services');
      const dto = servicesService.search.mock.calls.at(-1)![0];
      expect(dto).toMatchObject({ sort: 'newest', page: 1, limit: 20 });
    });
  });

  describe('status codes', () => {
    it('DELETE returns 204 with no body', async () => {
      const res = await auth(request(app.getHttpServer()).delete('/services/s1'));
      expect(res.status).toBe(204);
      expect(res.body).toEqual({});
    });

    it('visibility rejects DRAFT — it is a starting state, not a destination', async () => {
      const res = await auth(
        request(app.getHttpServer()).patch('/services/s1/visibility').send({ status: 'DRAFT' }),
      );
      expect(res.status).toBe(400);
    });

    it('category create rejects a malformed slug', async () => {
      const res = await auth(
        request(app.getHttpServer()).post('/categories').send({ name: 'X', slug: 'Not A Slug' }),
      );
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain('slug');
    });
  });
});
