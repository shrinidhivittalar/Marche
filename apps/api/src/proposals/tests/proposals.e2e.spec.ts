import {
  INestApplication,
  ValidationPipe,
  ExecutionContext,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ProposalsController } from '../controllers/proposals.controller';
import { JobProposalsController } from '../controllers/job-proposals.controller';
import { ConnectionsController } from '../controllers/connections.controller';
import { ProposalsService } from '../services/proposals.service';
import { ConnectionsService } from '../services/connections.service';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';

// Real HTTP through the real ValidationPipe, the real routing table and the
// real controllers — the layer unit tests structurally cannot reach: request
// parsing, DTO validation and transformation, status codes, route matching.
//
// The service layer is mocked so these stay fast and hermetic. What they do
// NOT cover is the database, and in particular the concurrency behaviour
// acceptance depends on. That is deliberate and covered elsewhere, by
// acceptance.integration-spec.ts against the real database.
//
// JwtAuthGuard is stubbed to accept any bearer token and reject requests
// without one. Real token verification is Module 1's job; what matters here
// is that the guard is actually applied to every route in this module.
const AUTHED_USER = { id: 'user_1', email: 'p@example.invalid', name: 'P', role: 'PROVIDER' };

const UUID = '3f1c0f9e-0000-4000-8000-000000000000';

describe('proposals HTTP', () => {
  let app: INestApplication;
  let proposalsService: { [key: string]: jest.Mock };
  let connectionsService: { [key: string]: jest.Mock };

  beforeAll(async () => {
    proposalsService = {
      submit: jest.fn().mockResolvedValue({ id: 'proposal_1' }),
      withdraw: jest.fn().mockResolvedValue(undefined),
      accept: jest.fn().mockResolvedValue({ id: 'connection_1' }),
      reject: jest.fn().mockResolvedValue(undefined),
      listMine: jest.fn().mockResolvedValue({ data: [], pagination: {} }),
      findById: jest.fn().mockResolvedValue({ id: 'proposal_1' }),
      listForJob: jest.fn().mockResolvedValue({ data: [], pagination: {} }),
      findForJob: jest.fn().mockResolvedValue({ id: 'proposal_1' }),
      listAttachments: jest.fn().mockResolvedValue([]),
      addAttachment: jest.fn().mockResolvedValue({ id: 'attachment_1' }),
      removeAttachment: jest.fn().mockResolvedValue(undefined),
    };
    connectionsService = {
      listMine: jest.fn().mockResolvedValue({ data: [], pagination: {} }),
      findById: jest.fn().mockResolvedValue({ id: 'connection_1' }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ProposalsController, JobProposalsController, ConnectionsController],
      providers: [
        { provide: ProposalsService, useValue: proposalsService },
        { provide: ConnectionsService, useValue: connectionsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          // Throws rather than returning false: returning false makes Nest
          // respond 403, but the real guard throws and responds 401.
          if (!req.headers.authorization) {
            throw new UnauthorizedException();
          }
          req.user = AUTHED_USER;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    // Identical to main.ts. whitelist + forbidNonWhitelisted is what turns an
    // undeclared field into a 400 rather than a silently ignored value.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    Object.values(proposalsService).forEach((fn) => fn.mockClear());
    Object.values(connectionsService).forEach((fn) => fn.mockClear());
  });

  const auth = (req: request.Test) => req.set('Authorization', 'Bearer test-token');
  const server = () => app.getHttpServer();

  // Several cases below are table-driven over the HTTP verb, which supertest
  // exposes as a method name rather than an argument. One helper, so the
  // cast lives in a single place.
  type Verb = 'get' | 'post' | 'patch' | 'put' | 'delete';
  const send = (method: Verb, path: string) => {
    const agent = request(server()) as unknown as Record<string, (p: string) => request.Test>;
    return agent[method](path).send({});
  };

  const validBody = {
    jobId: UUID,
    coverMessage: 'A cover message long enough to satisfy the validation rules.',
    proposedPrice: 25000,
    deliveryDays: 7,
  };

  describe('authentication', () => {
    // Nothing about a proposal is public. Unlike requirements, where browse
    // and single reads are deliberately open, there is no unauthenticated
    // path to any of this.
    it.each([
      ['post', '/proposals'],
      ['get', '/proposals/me'],
      ['get', `/proposals/${UUID}`],
      ['post', `/proposals/${UUID}/withdraw`],
      ['post', `/proposals/${UUID}/accept`],
      ['post', `/proposals/${UUID}/reject`],
      ['get', `/proposals/${UUID}/attachments`],
      ['post', `/proposals/${UUID}/attachments`],
      ['delete', `/proposals/${UUID}/attachments/${UUID}`],
      ['get', `/jobs/${UUID}/proposals`],
      ['get', `/jobs/${UUID}/proposals/${UUID}`],
      ['get', '/connections/me'],
      ['get', `/connections/${UUID}`],
    ] as [Verb, string][])('401s an unauthenticated %s %s', async (method, path) => {
      const res = await send(method, path);

      expect(res.status).toBe(401);
    });
  });

  describe('mass assignment is rejected at the boundary', () => {
    it.each([
      'providerProfileId',
      'status',
      'acceptedAt',
      'rejectedAt',
      'withdrawnAt',
      'submittedAt',
      'id',
    ])('rejects a submission carrying %s', async (field) => {
      const res = await auth(
        request(server())
          .post('/proposals')
          .send({ ...validBody, [field]: 'injected' }),
      );

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain(`property ${field} should not exist`);
      expect(proposalsService.submit).not.toHaveBeenCalled();
    });

    it('accepts only mediaId on an attachment', async () => {
      const res = await auth(
        request(server())
          .post(`/proposals/${UUID}/attachments`)
          .send({ mediaId: UUID, displayOrder: 99 }),
      );

      // Display order is assigned by the server from the current count, so a
      // client cannot position their file ahead of anything.
      expect(res.status).toBe(400);
      expect(proposalsService.addAttachment).not.toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    it.each([
      ['a non-uuid jobId', { jobId: 'not-a-uuid' }],
      ['a whitespace-only cover message', { coverMessage: '                              ' }],
      ['a cover message under the minimum', { coverMessage: 'too short' }],
      ['a negative price', { proposedPrice: -1 }],
      ['an absurd price', { proposedPrice: 99999999999 }],
      ['a price with three decimals', { proposedPrice: 10.123 }],
      ['zero delivery days', { deliveryDays: 0 }],
      ['fractional delivery days', { deliveryDays: 1.5 }],
      ['an absurd delivery time', { deliveryDays: 5000 }],
    ])('400s %s', async (_label, override) => {
      const res = await auth(
        request(server())
          .post('/proposals')
          .send({ ...validBody, ...override }),
      );

      expect(res.status).toBe(400);
      expect(proposalsService.submit).not.toHaveBeenCalled();
    });

    it('allows a price of zero — a free or promotional offer is real', async () => {
      const res = await auth(
        request(server())
          .post('/proposals')
          .send({ ...validBody, proposedPrice: 0 }),
      );

      expect(res.status).toBe(201);
    });

    it('trims the cover message before storing it', async () => {
      await auth(
        request(server())
          .post('/proposals')
          .send({ ...validBody, coverMessage: `   ${validBody.coverMessage}   ` }),
      );

      const [, dto] = proposalsService.submit.mock.calls[0];
      expect(dto.coverMessage).toBe(validBody.coverMessage);
    });

    it('coerces pagination and rejects an over-large page size', async () => {
      await auth(request(server()).get('/proposals/me?page=2&limit=10'));
      const [, pagination] = proposalsService.listMine.mock.calls[0];
      expect(pagination).toEqual({ page: 2, limit: 10 });

      const res = await auth(request(server()).get('/proposals/me?limit=500'));
      expect(res.status).toBe(400);
    });
  });

  describe('routing', () => {
    it("does not treat 'me' as a proposal id", async () => {
      await auth(request(server()).get('/proposals/me'));

      expect(proposalsService.listMine).toHaveBeenCalled();
      expect(proposalsService.findById).not.toHaveBeenCalled();
    });

    it("does not treat 'me' as a connection id", async () => {
      await auth(request(server()).get('/connections/me'));

      expect(connectionsService.listMine).toHaveBeenCalled();
      expect(connectionsService.findById).not.toHaveBeenCalled();
    });

    it('passes both ids from the nested proposal route', async () => {
      await auth(request(server()).get(`/jobs/job-id/proposals/proposal-id`));

      expect(proposalsService.findForJob).toHaveBeenCalledWith('user_1', 'job-id', 'proposal-id');
    });

    it('takes the caller from the token, never from the request', async () => {
      await auth(request(server()).post('/proposals').send(validBody));

      const [userId] = proposalsService.submit.mock.calls[0];
      expect(userId).toBe('user_1');
    });
  });

  describe('status codes', () => {
    it('201s a submission and returns the proposal', async () => {
      const res = await auth(request(server()).post('/proposals').send(validBody));

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ id: 'proposal_1' });
    });

    it('201s an acceptance and returns the connection', async () => {
      const res = await auth(request(server()).post(`/proposals/${UUID}/accept`));

      // The connection is the outcome the client now acts on, so it is worth
      // returning rather than a bare 204.
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ id: 'connection_1' });
    });

    it.each([
      ['withdraw', `/proposals/${UUID}/withdraw`],
      ['reject', `/proposals/${UUID}/reject`],
    ])('204s a %s, which has no body worth returning', async (_label, path) => {
      const res = await auth(request(server()).post(path));

      expect(res.status).toBe(204);
      expect(res.body).toEqual({});
    });

    it('204s a detach', async () => {
      const res = await auth(request(server()).delete(`/proposals/${UUID}/attachments/${UUID}`));

      expect(res.status).toBe(204);
    });
  });

  describe('service errors reach the client as themselves', () => {
    it('409s a duplicate submission', async () => {
      proposalsService.submit.mockRejectedValueOnce(
        new ConflictException('You have already proposed on this requirement'),
      );

      const res = await auth(request(server()).post('/proposals').send(validBody));

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/already proposed/i);
    });

    it('409s an acceptance on a requirement already filled', async () => {
      proposalsService.accept.mockRejectedValueOnce(
        new ConflictException('This requirement is no longer accepting proposals'),
      );

      const res = await auth(request(server()).post(`/proposals/${UUID}/accept`));

      expect(res.status).toBe(409);
    });

    it('403s a proposal belonging to someone else', async () => {
      proposalsService.findById.mockRejectedValueOnce(
        new ForbiddenException('You do not have access to this proposal'),
      );

      const res = await auth(request(server()).get(`/proposals/${UUID}`));

      // 403 rather than 404: no proposal route is public, so there is
      // nothing to hide from an anonymous caller, and this matches how the
      // rest of the codebase answers once a resource has been found.
      expect(res.status).toBe(403);
    });

    it('404s a proposal that is not on the requirement in the path', async () => {
      proposalsService.findForJob.mockRejectedValueOnce(
        new NotFoundException('Proposal not found on this requirement'),
      );

      const res = await auth(request(server()).get(`/jobs/${UUID}/proposals/${UUID}`));

      expect(res.status).toBe(404);
    });
  });

  describe('routes that deliberately do not exist', () => {
    // A submitted proposal is immutable except for withdrawal. Without this,
    // a provider could be shortlisted at one price and then change it.
    it.each([
      ['patch', `/proposals/${UUID}`],
      ['put', `/proposals/${UUID}`],
      ['delete', `/proposals/${UUID}`],
    ] as [Verb, string][])('404s %s %s', async (method, path) => {
      const res = await auth(send(method, path));

      expect(res.status).toBe(404);
    });

    // The one that matters most: a connection exists only because a proposal
    // was accepted, so there is no way to manufacture one.
    it.each([
      ['post', '/connections'],
      ['patch', `/connections/${UUID}`],
      ['delete', `/connections/${UUID}`],
    ] as [Verb, string][])('404s %s %s', async (method, path) => {
      const res = await auth(send(method, path));

      expect(res.status).toBe(404);
    });
  });
});
