import { ForbiddenException } from '@nestjs/common';
import { assertClientRole, assertProviderRole, hasCapability } from '../profile-access.util';

describe('hasCapability — capability is the sole source of truth (Module 01 Slice 4 cutover)', () => {
  it('grants access from a real UserCapability row, independent of the legacy role', () => {
    // Deliberately mismatched role, to prove the capability row alone is
    // sufficient — this is what "loaded from the database, not trusted
    // from a JWT claim" means in practice: the capability set is checked
    // on its own merits.
    const user = { role: 'CLIENT' as const, capabilities: [{ capability: 'PROVIDER' as const }] };
    expect(hasCapability(user, 'PROVIDER')).toBe(true);
  });

  it('denies a capability neither the role nor a capability row grants', () => {
    const user = { role: 'CLIENT' as const, capabilities: [{ capability: 'CLIENT' as const }] };
    expect(hasCapability(user, 'PROVIDER')).toBe(false);
  });

  it('accepts the flattened Capability[] shape JwtStrategy exposes on request.user, not just the raw Prisma relation shape', () => {
    const user = { role: 'CLIENT' as const, capabilities: ['PROVIDER' as const] };
    expect(hasCapability(user, 'PROVIDER')).toBe(true);
  });

  describe('the legacy-role fallback is gone as of Slice 4', () => {
    it('a matching legacy role with no capability row no longer grants access — the exact case the Slice 2/3 fallback used to cover', () => {
      const user = { role: 'PROVIDER' as const, capabilities: [] };
      expect(hasCapability(user, 'PROVIDER')).toBe(false);
    });

    it('a matching legacy role with capabilities entirely absent from the object no longer grants access', () => {
      const user = { role: 'CLIENT' as const };
      expect(hasCapability(user, 'CLIENT')).toBe(false);
    });

    it('a mismatched legacy role alongside the real capability row is irrelevant — only the row matters', () => {
      const user = { role: 'ADMIN' as const, capabilities: [{ capability: 'CLIENT' as const }] };
      expect(hasCapability(user, 'CLIENT')).toBe(true);
    });
  });

  describe('assertProviderRole / assertClientRole', () => {
    it('assertProviderRole throws for a user with no PROVIDER capability row, even with a matching legacy role', () => {
      expect(() => assertProviderRole({ role: 'PROVIDER', capabilities: [] })).toThrow(
        ForbiddenException,
      );
    });

    it('assertProviderRole passes for a real PROVIDER capability row', () => {
      expect(() =>
        assertProviderRole({ role: 'CLIENT', capabilities: [{ capability: 'PROVIDER' }] }),
      ).not.toThrow();
    });

    it('assertClientRole throws for a user with no CLIENT capability row, even with a matching legacy role', () => {
      expect(() => assertClientRole({ role: 'CLIENT', capabilities: [] })).toThrow(
        ForbiddenException,
      );
    });

    it('assertClientRole passes for a user holding only a CLIENT capability row, regardless of legacy role', () => {
      expect(() =>
        assertClientRole({ role: 'PROVIDER', capabilities: [{ capability: 'CLIENT' }] }),
      ).not.toThrow();
    });

    it('a user holding both capabilities passes both checks', () => {
      const dualCapabilityUser = {
        role: 'CLIENT' as const,
        capabilities: [{ capability: 'CLIENT' as const }, { capability: 'PROVIDER' as const }],
      };
      expect(() => assertClientRole(dualCapabilityUser)).not.toThrow();
      expect(() => assertProviderRole(dualCapabilityUser)).not.toThrow();
    });
  });
});
