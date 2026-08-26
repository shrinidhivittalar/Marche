import { ForbiddenException } from '@nestjs/common';
import { assertClientRole, assertProviderRole, hasCapability } from '../profile-access.util';

describe('hasCapability — capability authorization with legacy-role compatibility', () => {
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

  describe('compatibility fallback (module1-migration-plan.md §2.2 expand/migrate transition)', () => {
    it('falls back to the legacy role when capabilities is an empty array — a newly-registered user with no capability row yet is not locked out', () => {
      const user = { role: 'PROVIDER' as const, capabilities: [] };
      expect(hasCapability(user, 'PROVIDER')).toBe(true);
    });

    it('falls back to the legacy role when capabilities is entirely absent from the object', () => {
      const user = { role: 'CLIENT' as const };
      expect(hasCapability(user, 'CLIENT')).toBe(true);
    });

    it('the fallback does not grant a capability the legacy role does not match', () => {
      const user = { role: 'CLIENT' as const, capabilities: [] };
      expect(hasCapability(user, 'PROVIDER')).toBe(false);
    });

    it('a real capability row and a matching legacy role together still grant access (both paths agree, as Slice 1-backfilled users have)', () => {
      const user = { role: 'CLIENT' as const, capabilities: [{ capability: 'CLIENT' as const }] };
      expect(hasCapability(user, 'CLIENT')).toBe(true);
    });
  });

  describe('assertProviderRole / assertClientRole', () => {
    it('assertProviderRole throws for a Client with no PROVIDER capability or role', () => {
      expect(() => assertProviderRole({ role: 'CLIENT', capabilities: [] })).toThrow(
        ForbiddenException,
      );
    });

    it('assertProviderRole passes for a legacy Provider with no capability row yet', () => {
      expect(() => assertProviderRole({ role: 'PROVIDER' })).not.toThrow();
    });

    it('assertClientRole throws for a Provider with no CLIENT capability or role', () => {
      expect(() => assertClientRole({ role: 'PROVIDER', capabilities: [] })).toThrow(
        ForbiddenException,
      );
    });

    it('assertClientRole passes for a user holding only a CLIENT capability row, regardless of legacy role', () => {
      // Covers the eventual post-migration shape: role could in principle
      // be stale/irrelevant once capability rows are the real source of
      // truth — the capability row alone must be sufficient.
      expect(() =>
        assertClientRole({ role: 'PROVIDER', capabilities: [{ capability: 'CLIENT' }] }),
      ).not.toThrow();
    });

    it('a user holding both capabilities passes both checks — the dual-capability case Slice 1/2 make structurally possible', () => {
      const dualCapabilityUser = {
        role: 'CLIENT' as const,
        capabilities: [{ capability: 'CLIENT' as const }, { capability: 'PROVIDER' as const }],
      };
      expect(() => assertClientRole(dualCapabilityUser)).not.toThrow();
      expect(() => assertProviderRole(dualCapabilityUser)).not.toThrow();
    });
  });
});
