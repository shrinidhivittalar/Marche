import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { ProposalsController } from '../controllers/proposals.controller';
import { JobProposalsController } from '../controllers/job-proposals.controller';
import { ConnectionsController } from '../controllers/connections.controller';

// Same reasoning as the jobs and marketplace route specs: Nest registers
// routes in declaration order, so a literal path declared after a
// parameterised one on the same verb is unreachable. /proposals/me would be
// swallowed by /proposals/:id and "me" treated as a proposal id — a routing
// bug no service-layer test can see, surfacing only as a confusing 404.
type Route = { handler: string; method: number; path: string };

function routesOf(controller: new (...args: never[]) => unknown): Route[] {
  const prototype = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor' && typeof prototype[name] === 'function')
    .map((handler) => ({
      handler,
      method: Reflect.getMetadata(METHOD_METADATA, prototype[handler] as object) as number,
      path: Reflect.getMetadata(PATH_METADATA, prototype[handler] as object) as string,
    }))
    .filter((route) => route.path !== undefined);
}

const controllerGuards = (controller: new (...args: never[]) => unknown) =>
  Boolean(Reflect.getMetadata('__guards__', controller));

const signatureOf = (routes: Route[]) =>
  routes.map((r) => `${RequestMethod[r.method]} /${r.path}`.replace(/\/$/, ''));

describe('proposals route registration', () => {
  const routes = routesOf(ProposalsController);

  it("declares the literal 'me' route before the ':id' route", () => {
    const gets = routes.filter((r) => r.method === RequestMethod.GET).map((r) => r.path);

    expect(gets.indexOf('me')).toBeGreaterThanOrEqual(0);
    expect(gets.indexOf('me')).toBeLessThan(gets.indexOf(':id'));
  });

  it('exposes the endpoints module5.md specifies', () => {
    expect(signatureOf(routes)).toEqual(
      expect.arrayContaining([
        'POST /',
        'GET /me',
        'GET /:id',
        'POST /:id/withdraw',
        'POST /:id/accept',
        'POST /:id/reject',
        'GET /:id/attachments',
        'POST /:id/attachments',
        'DELETE /:id/attachments/:attachmentId',
      ]),
    );
  });

  // Unlike jobs, nothing here is public. A requirement is advertising; a
  // proposal is a private offer between two parties.
  it('guards every route, at the controller', () => {
    expect(controllerGuards(ProposalsController)).toBe(true);
    expect(controllerGuards(JobProposalsController)).toBe(true);
    expect(controllerGuards(ConnectionsController)).toBe(true);
  });

  // A submitted proposal is immutable except for withdrawal. A PATCH would
  // let a provider be shortlisted at one price and then change it.
  it('exposes no route that edits a submitted proposal', () => {
    const verbs = routes.map((r) => r.method);
    expect(verbs).not.toContain(RequestMethod.PATCH);
    expect(verbs).not.toContain(RequestMethod.PUT);
  });

  // Each decision is its own path, so no caller can set a status directly
  // and each transition has one auditable route.
  it('gives every decision its own route', () => {
    const paths = routes.map((r) => r.path);
    expect(paths).toEqual(expect.arrayContaining([':id/accept', ':id/reject', ':id/withdraw']));
  });

  it('scopes attachment routes under the proposal that owns them', () => {
    const paths = routes.map((r) => r.path);
    expect(paths).toContain(':id/attachments');
    expect(paths).toContain(':id/attachments/:attachmentId');
  });
});

describe('job proposals route registration', () => {
  const routes = routesOf(JobProposalsController);

  it("reads a requirement's proposals, and only reads them", () => {
    expect(signatureOf(routes)).toEqual(expect.arrayContaining(['GET /', 'GET /:proposalId']));
    expect(routes.every((r) => r.method === RequestMethod.GET)).toBe(true);
  });

  // The path sits under /jobs but the controller belongs to this module, so
  // Jobs never learns that Proposals exist.
  it('lives in the proposals module while serving a /jobs path', () => {
    expect(Reflect.getMetadata(PATH_METADATA, JobProposalsController)).toBe(
      'jobs/:jobId/proposals',
    );
  });
});

describe('connections route registration', () => {
  const routes = routesOf(ConnectionsController);

  it("declares the literal 'me' route before the ':id' route", () => {
    const gets = routes.filter((r) => r.method === RequestMethod.GET).map((r) => r.path);

    expect(gets.indexOf('me')).toBeLessThan(gets.indexOf(':id'));
  });

  // The most important assertion in this file. A connection is created
  // inside the acceptance transaction and nowhere else; a POST here would be
  // a way to manufacture a hiring relationship no proposal produced.
  it('exposes no way to create, change or delete a connection', () => {
    expect(routes.every((r) => r.method === RequestMethod.GET)).toBe(true);
  });
});
