import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { ServicesController } from '../controllers/services.controller';
import { CategoriesController } from '../controllers/categories.controller';
import { MarketplaceController } from '../controllers/marketplace.controller';

// Nest builds its router from the decorator metadata below, in declaration
// order. A literal path declared after a parameterised one on the same verb
// is unreachable — /services/me would be swallowed by /services/:id and
// "me" treated as an id. That is a routing bug no unit test of the service
// layer can see, and it would only show up as a confusing 404 at runtime.
type Route = { handler: string; method: number; path: string };

function routesOf(controller: new (...args: never[]) => unknown): Route[] {
  const prototype = controller.prototype as Record<string, unknown>;
  // Property order on a class prototype follows declaration order for
  // string keys, which is exactly the order Nest registers them in.
  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor' && typeof prototype[name] === 'function')
    .map((handler) => ({
      handler,
      method: Reflect.getMetadata(METHOD_METADATA, prototype[handler] as object) as number,
      path: Reflect.getMetadata(PATH_METADATA, prototype[handler] as object) as string,
    }))
    .filter((route) => route.path !== undefined);
}

describe('marketplace route registration', () => {
  describe('ServicesController', () => {
    const routes = routesOf(ServicesController);
    const gets = routes.filter((r) => r.method === RequestMethod.GET);

    it("declares the literal 'me' route before the ':id' route", () => {
      const me = gets.findIndex((r) => r.path === 'me');
      const byId = gets.findIndex((r) => r.path === ':id');
      expect(me).toBeGreaterThanOrEqual(0);
      expect(byId).toBeGreaterThanOrEqual(0);
      expect(me).toBeLessThan(byId);
    });

    it('exposes the endpoints module3.md specifies', () => {
      const signature = routes.map((r) =>
        `${RequestMethod[r.method]} /${r.path}`.replace(/\/$/, ''),
      );
      expect(signature).toEqual(
        expect.arrayContaining([
          'GET /',
          'GET /me',
          'GET /:id',
          'POST /',
          'PATCH /:id',
          'PATCH /:id/visibility',
          'DELETE /:id',
        ]),
      );
    });

    // Visibility changes travel through their own route rather than the
    // general update, so there is one auditable path for a state change.
    it('keeps visibility on a dedicated route', () => {
      const patches = routes.filter((r) => r.method === RequestMethod.PATCH).map((r) => r.path);
      expect(patches).toContain(':id/visibility');
    });
  });

  describe('CategoriesController', () => {
    const routes = routesOf(CategoriesController);

    it('serves the tree at the collection root and a single category by slug', () => {
      const gets = routes.filter((r) => r.method === RequestMethod.GET).map((r) => r.path);
      expect(gets).toEqual(['/', ':slug']);
    });

    it('exposes admin mutations', () => {
      const mutations = routes
        .filter((r) => r.method !== RequestMethod.GET)
        .map((r) => `${RequestMethod[r.method]} ${r.path}`);
      expect(mutations).toEqual(['POST /', 'PATCH :id', 'DELETE :id']);
    });
  });

  describe('MarketplaceController', () => {
    // Provider detail deliberately lives in Module 2 (/profiles/:id,
    // /u/:username). A second detail endpoint here would be a second place
    // for visibility rules to drift out of sync.
    it('exposes provider discovery only, not provider detail', () => {
      const routes = routesOf(MarketplaceController);
      expect(routes).toHaveLength(1);
      expect(routes[0].path).toBe('providers');
    });
  });
});
