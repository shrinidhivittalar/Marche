import { API_URL } from '../playwright.config';
import { createUser, prisma, RUN_TAG, saveState } from './test-users';

// Creates the four accounts the suite needs. Four rather than one because
// the rules worth testing are all about *who* is acting: a client must not
// be able to create a service, a second provider must not be able to see
// the first one's listings, and only an admin may touch categories. One
// user cannot prove any of that.
//
// No session is saved here. Sharing a stored cookie jar between tests was
// tried and cannot work: refresh tokens are single-use and rotating, so the
// first page load consumes the token and every later test using the same
// jar is unauthenticated. Each test signs in for itself instead, which is
// why the API's auth rate limit is raised for the test server — see
// playwright.config.ts.
export default async function globalSetup() {
  const db = prisma();
  try {
    const [provider, otherProvider, client, admin] = await Promise.all([
      createUser(API_URL, db, 'PROVIDER', 'provider'),
      createUser(API_URL, db, 'PROVIDER', 'other-provider'),
      createUser(API_URL, db, 'CLIENT', 'client'),
      createUser(API_URL, db, 'ADMIN', 'admin'),
    ]);

    saveState({ runTag: RUN_TAG, provider, otherProvider, client, admin });
    console.log(`[e2e] created 4 test accounts tagged ${RUN_TAG}`);
  } finally {
    await db.$disconnect();
  }
}
