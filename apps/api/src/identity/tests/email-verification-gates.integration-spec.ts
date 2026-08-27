import { Test, type TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../services/auth.service';
import { CapabilitiesService } from '../services/capabilities.service';
import { JobsService } from '../../jobs/services/jobs.service';
import { ProposalsService } from '../../proposals/services/proposals.service';
import { DirectContractsService } from '../../direct-contracts/services/direct-contracts.service';
import { RedisThrottlerStorage } from '../../throttler/redis-throttler-storage';
import { EmailService } from '../../email/email.service';

/**
 * Module 01 Slice 5 — verification model and the four EMAIL enforcement
 * points locked in with the user: capability activation, Job DRAFT ->
 * PUBLISHED, proposal submission, and direct-contract creation. Against
 * the real test database — the write-path transaction (User.emailVerifiedAt
 * + Verification row together) and the real service guards are what a
 * mock cannot prove.
 *
 * Runs against TEST_DATABASE_URL. Everything created here is prefixed
 * `m1-slice5-` and deleted in afterAll.
 */

jest.setTimeout(30_000);

const RUN = `m1-slice5-${Date.now()}`;
const created = {
  userIds: [] as string[],
  profileIds: [] as string[],
  categoryIds: [] as string[],
  jobIds: [] as string[],
};

describe('Email verification gates', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let authService: AuthService;
  let capabilitiesService: CapabilitiesService;
  let jobsService: JobsService;
  let proposalsService: ProposalsService;
  let directContractsService: DirectContractsService;
  let categoryId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RedisThrottlerStorage)
      .useValue({
        increment: async () => ({
          totalHits: 0,
          timeToExpire: 0,
          isBlocked: false,
          timeToBlockExpire: 0,
        }),
      })
      .compile();
    prisma = moduleRef.get(PrismaService);
    authService = moduleRef.get(AuthService);
    capabilitiesService = moduleRef.get(CapabilitiesService);
    jobsService = moduleRef.get(JobsService);
    proposalsService = moduleRef.get(ProposalsService);
    directContractsService = moduleRef.get(DirectContractsService);

    const category = await prisma.client.category.create({
      data: { name: `${RUN} category`, slug: `${RUN}-category` },
    });
    categoryId = category.id;
    created.categoryIds.push(categoryId);
  });

  afterAll(async () => {
    await prisma.client.proposal.deleteMany({ where: { jobId: { in: created.jobIds } } });
    await prisma.client.job.deleteMany({ where: { id: { in: created.jobIds } } });
    await prisma.client.category.deleteMany({ where: { id: { in: created.categoryIds } } });
    await prisma.client.verification.deleteMany({ where: { userId: { in: created.userIds } } });
    await prisma.client.userCapability.deleteMany({ where: { userId: { in: created.userIds } } });
    await prisma.client.profile.deleteMany({ where: { id: { in: created.profileIds } } });
    await prisma.client.user.deleteMany({ where: { id: { in: created.userIds } } });
    await moduleRef.close();
  }, 60_000);

  async function registerUser(label: string, role: 'CLIENT' | 'PROVIDER') {
    const email = `${RUN}-${label}@example.invalid`;
    await authService.register({ email, password: 'Str0ngPassword!', name: label, role });
    const user = await prisma.client.user.findUniqueOrThrow({ where: { email } });
    const profile = await prisma.client.profile.findUniqueOrThrow({ where: { userId: user.id } });
    created.userIds.push(user.id);
    created.profileIds.push(profile.id);
    return { userId: user.id, profileId: profile.id };
  }

  async function verifyEmail(userId: string) {
    const token = await prisma.client.verificationToken.findFirstOrThrow({ where: { userId } });
    // authService.verifyEmail looks the token up by its hash, not its raw
    // value, and the raw value is only ever known at issuance time (it's
    // emailed out, not stored) — so this test drives the write path
    // directly, the same shortcut the rest of this suite takes for
    // anything that would otherwise require reading an email.
    await prisma.client.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });
    await prisma.client.verification.upsert({
      where: { userId_type: { userId, type: 'EMAIL' } },
      create: { userId, type: 'EMAIL', status: 'VERIFIED', verifiedAt: new Date() },
      update: { status: 'VERIFIED', verifiedAt: new Date() },
    });
    await prisma.client.verificationToken.delete({ where: { id: token.id } });
  }

  describe('AuthService.verifyEmail writes both records together', () => {
    it('creates a Verification(EMAIL, VERIFIED) row alongside User.emailVerifiedAt, from the same token redemption', async () => {
      const email = `${RUN}-writepath@example.invalid`;
      let capturedToken = '';
      const emailService = moduleRef.get(EmailService);
      const spy = jest
        .spyOn(emailService, 'sendVerificationEmail')
        .mockImplementation(async (_email: string, token: string) => {
          capturedToken = token;
        });

      await authService.register({
        email,
        password: 'Str0ngPassword!',
        name: 'Write Path',
        role: 'CLIENT',
      });
      spy.mockRestore();
      const user = await prisma.client.user.findUniqueOrThrow({ where: { email } });
      created.userIds.push(user.id);
      const profile = await prisma.client.profile.findUniqueOrThrow({ where: { userId: user.id } });
      created.profileIds.push(profile.id);

      const before = await prisma.client.verification.findUnique({
        where: { userId_type: { userId: user.id, type: 'EMAIL' } },
      });
      expect(before).toBeNull();

      // The real entry point — a raw token, exactly as the emailed link
      // would deliver it — through the real service.
      await authService.verifyEmail(capturedToken);

      const reloadedUser = await prisma.client.user.findUniqueOrThrow({ where: { id: user.id } });
      const verification = await prisma.client.verification.findUniqueOrThrow({
        where: { userId_type: { userId: user.id, type: 'EMAIL' } },
      });
      expect(reloadedUser.emailVerifiedAt).not.toBeNull();
      expect(verification.status).toBe('VERIFIED');
      expect(verification.verifiedAt?.getTime()).toBe(reloadedUser.emailVerifiedAt?.getTime());
    });
  });

  describe('capability activation', () => {
    it('rejects activation for an unverified user', async () => {
      const { userId } = await registerUser('activate-unverified', 'CLIENT');

      await expect(capabilitiesService.activate(userId, 'PROVIDER')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('succeeds once verified', async () => {
      const { userId } = await registerUser('activate-verified', 'CLIENT');
      await verifyEmail(userId);

      await expect(capabilitiesService.activate(userId, 'PROVIDER')).resolves.toBeUndefined();
    });
  });

  describe('Job DRAFT -> PUBLISHED', () => {
    it('allows creating a draft while unverified, but rejects publishing it', async () => {
      const { userId } = await registerUser('job-unverified', 'CLIENT');

      const job = await jobsService.create(userId, {
        title: 'Unverified draft',
        description: 'A description long enough to satisfy the validation rules.',
        categoryId,
      });
      created.jobIds.push(job.id);
      expect(job.status).toBe('DRAFT');

      await expect(jobsService.publish(userId, job.id)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('publishes once the owner is verified', async () => {
      const { userId } = await registerUser('job-verified', 'CLIENT');
      await verifyEmail(userId);

      const job = await jobsService.create(userId, {
        title: 'Verified draft',
        description: 'A description long enough to satisfy the validation rules.',
        categoryId,
      });
      created.jobIds.push(job.id);

      const published = await jobsService.publish(userId, job.id);
      expect(published.status).toBe('PUBLISHED');
    });
  });

  describe('Proposal submission', () => {
    it('rejects a submission from an unverified provider', async () => {
      const client = await registerUser('proposal-client', 'CLIENT');
      await verifyEmail(client.userId);
      const provider = await registerUser('proposal-provider-unverified', 'PROVIDER');

      const job = await jobsService.create(client.userId, {
        title: 'Requirement for an unverified provider',
        description: 'A description long enough to satisfy the validation rules.',
        categoryId,
      });
      created.jobIds.push(job.id);
      await jobsService.publish(client.userId, job.id);

      await expect(
        proposalsService.submit(provider.userId, { jobId: job.id, proposedPrice: 1000 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('Direct contract creation', () => {
    it('rejects an unverified client', async () => {
      const client = await registerUser('direct-client-unverified', 'CLIENT');
      const provider = await registerUser('direct-provider', 'PROVIDER');
      await verifyEmail(provider.userId);

      await expect(
        directContractsService.create(client.userId, {
          providerProfileId: provider.profileId,
          categoryId,
          title: 'Direct offer to an unverified client',
          description: 'A description long enough to satisfy the validation rules.',
          price: 5000,
          deliveryDays: 5,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('migration compatibility', () => {
    it('every user with emailVerifiedAt set holds a matching Verification(EMAIL, VERIFIED) row', async () => {
      const mismatched = await prisma.client.user.count({
        where: {
          emailVerifiedAt: { not: null },
          deletedAt: null,
          verifications: { none: { type: 'EMAIL', status: 'VERIFIED' } },
        },
      });
      expect(mismatched).toBe(0);
    });
  });
});
