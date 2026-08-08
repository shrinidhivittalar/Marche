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
const AUTHED_USER = { id: 'user_1', email: 'p@example.com', name: 'P', role: 'PROVIDER' };

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
          req.user = AUTHED_USER;
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
      await request(app.getHttpServer()).get('/services?skills=a,b,c');
      expect(servicesService.search.mock.calls.at(-1)![0].skills).toEqual(['a', 'b', 'c']);
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
