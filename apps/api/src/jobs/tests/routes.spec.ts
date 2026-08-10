import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { JobsController } from '../controllers/jobs.controller';

// Same reasoning as the marketplace's routes.spec.ts: Nest registers routes
// in declaration order, so a literal path declared after a parameterised one
// on the same verb is unreachable. /jobs/me would be swallowed by /jobs/:id
// and "me" treated as a job id — a routing bug no service-layer test can
// see, surfacing only as a confusing 404 at runtime.
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

const guarded = (handler: string) =>
  Boolean(Reflect.getMetadata('__guards__', JobsController.prototype[handler as never]));

describe('jobs route registration', () => {
  const routes = routesOf(JobsController);
  const gets = routes.filter((r) => r.method === RequestMethod.GET);

  it("declares both literal 'me' routes before the ':id' route", () => {
    const paths = gets.map((r) => r.path);
    const byId = paths.indexOf(':id');

    expect(paths.indexOf('me')).toBeGreaterThanOrEqual(0);
    expect(paths.indexOf('me/:id')).toBeGreaterThanOrEqual(0);
    expect(byId).toBeGreaterThanOrEqual(0);
    expect(paths.indexOf('me')).toBeLessThan(byId);
    expect(paths.indexOf('me/:id')).toBeLessThan(byId);
  });

  it('exposes the endpoints module4.md specifies', () => {
    const signature = routes.map((r) => `${RequestMethod[r.method]} /${r.path}`.replace(/\/$/, ''));
    expect(signature).toEqual(
      expect.arrayContaining([
        'GET /',
        'GET /me',
        'GET /me/:id',
        'GET /:id',
        'POST /',
        'PATCH /:id',
        'POST /:id/publish',
        'POST /:id/cancel',
        'DELETE /:id',
      ]),
    );
  });

  // Browse and single-requirement reads carry no auth guard: a provider
  // evaluating whether to sign up must be able to see the work on offer.
  it('leaves the two public reads unguarded', () => {
    expect(guarded('search')).toBe(false);
    expect(guarded('findOne')).toBe(false);
    expect(guarded('create')).toBe(true);
  });

  // The requirement is public; its files are not. A guest can read what a
  // client is asking for without being able to download their floor plan,
  // which is the whole reason attachments are not folded into GET /jobs/:id.
  it('guards attachment reads even though the requirement itself is public', () => {
    expect(guarded('listAttachments')).toBe(true);
    expect(guarded('addAttachment')).toBe(true);
    expect(guarded('removeAttachment')).toBe(true);
  });

  it('scopes attachment routes under the requirement that owns them', () => {
    const paths = routes.map((r) => r.path);
    expect(paths).toContain(':id/attachments');
    expect(paths).toContain(':id/attachments/:attachmentId');
  });

  // FILLED is reached by accepting a proposal, in Module 5. A route here
  // would let a client declare their own requirement filled and let the two
  // sides of the transaction disagree.
  it('exposes no route that sets a requirement to FILLED', () => {
    const paths = routes.map((r) => r.path.toLowerCase());
    expect(paths.some((p) => p.includes('fill'))).toBe(false);
  });

  // Lifecycle changes are their own routes rather than fields on the update
  // DTO, so each has one auditable path.
  it('keeps publish and cancel off the general update route', () => {
    const patches = routes.filter((r) => r.method === RequestMethod.PATCH).map((r) => r.path);
    expect(patches).toEqual([':id']);
  });
});
