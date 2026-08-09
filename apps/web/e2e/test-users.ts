import { PrismaClient } from '@prisma/client';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// apps/web is an ES module package, so __dirname does not exist.
const HERE = dirname(fileURLToPath(import.meta.url));

// Test accounts are created directly against the database rather than only
// through the API, for one reason: login requires a verified email, and the
// verification link is emailed. Registration goes through the real API so
// the real password hashing and profile-creation path is exercised, then
// emailVerifiedAt is stamped here because no mailbox exists to click.
//
// Every account carries the RUN_TAG prefix so teardown can identify exactly
// what this run created and delete nothing else. There is no shared test
// database yet, so precision matters more than convenience.

export const RUN_TAG = `e2e-${Date.now()}`;
const STATE_FILE = join(HERE, '.test-users.json');

export const PASSWORD = 'Str0ng!Passw0rd123';

export interface TestUser {
  email: string;
  password: string;
  name: string;
  role: 'CLIENT' | 'PROVIDER' | 'ADMIN';
  id: string;
}

export interface TestState {
  runTag: string;
  provider: TestUser;
  otherProvider: TestUser;
  client: TestUser;
  admin: TestUser;
}

export function saveState(state: TestState) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function loadState(): TestState {
  if (!existsSync(STATE_FILE)) {
    throw new Error('Test users file missing — global setup did not run.');
  }
  return JSON.parse(readFileSync(STATE_FILE, 'utf-8')) as TestState;
}

export function clearState() {
  if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
}

export function prisma() {
  return new PrismaClient();
}

export async function createUser(
  apiUrl: string,
  db: PrismaClient,
  role: 'CLIENT' | 'PROVIDER' | 'ADMIN',
  label: string,
): Promise<TestUser> {
  const email = `${RUN_TAG}-${label}@example.invalid`;
  const name = `E2E ${label}`;

  // ADMIN is not an accepted registration role — the API only allows CLIENT
  // and PROVIDER at signup, which is correct. Admins are created directly.
  if (role === 'ADMIN') {
    const argon2 = await import('argon2');
    const user = await db.user.create({
      data: {
        email,
        name,
        role: 'ADMIN',
        passwordHash: await argon2.hash(PASSWORD),
        emailVerifiedAt: new Date(),
        profile: { create: { displayName: name } },
      },
    });
    return { email, password: PASSWORD, name, role, id: user.id };
  }

  const res = await fetch(`${apiUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, name, role }),
  });
  if (!res.ok) {
    throw new Error(`Failed to register ${label}: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };

  await db.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });
  return { email, password: PASSWORD, name, role, id: body.id };
}

// Deletes only rows whose email carries this run's tag. User -> Profile ->
// Service -> ServiceSkill all cascade, so removing the users removes
// everything the run created.
export async function deleteRunUsers(db: PrismaClient, runTag: string): Promise<number> {
  const result = await db.user.deleteMany({ where: { email: { startsWith: runTag } } });
  return result.count;
}
