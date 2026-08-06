import { randomBytes, createHash } from 'crypto';

// Verification/reset/refresh tokens are handed to the client in raw form but
// only ever stored hashed, so a leaked database dump can't be replayed.
export function generateRawToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
