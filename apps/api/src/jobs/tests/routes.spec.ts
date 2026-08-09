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

describe('jobs route registration', () => {
  const routes = routesOf(JobsController);
  const gets = routes.filter((r) => r.method === RequestMethod.GET);

  it("declares the literal 'me' routes before any ':id' route", () => {
    const lastMe = gets.map((r) => r.path).lastIndexOf('me/:id');
    const byId = gets.findIndex((r) => r.path === ':id');

    expect(gets.findIndex((r) => r.path === 'me')).toBe(0);
    // No GET /:id exists yet — provider discovery lands in the next pass.
    // When it does, it must come after both 'me' routes.
    if (byId >= 0) {
      expect(lastMe).toBeLessThan(byId);
    }
  });

  it('exposes the owner endpoints module4.md specifies', () => {
    const signature = routes.map((r) => `${RequestMethod[r.method]} /${r.path}`.replace(/\/$/, ''));
    expect(signature).toEqual(
      expect.arrayContaining([
        'GET /me',
        'GET /me/:id',
        'POST /',
        'PATCH /:id',
        'POST /:id/publish',
        'POST /:id/cancel',
        'DELETE /:id',
      ]),
    );
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
