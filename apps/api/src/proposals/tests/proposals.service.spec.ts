import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ProposalsService } from '../services/proposals.service';
import type { CreateProposalDto } from '../dto/proposal.dto';

const PROVIDER = {
  id: 'provider_profile',
  userId: 'user_1',
  user: { role: 'PROVIDER', capabilities: [{ capability: 'PROVIDER' }] },
};
const CLIENT = {
  id: 'client_profile',
  userId: 'user_2',
  user: { role: 'CLIENT', capabilities: [{ capability: 'CLIENT' }] },
};

// The transaction client the mocked $transaction hands the callback. Identity
// is what the ordering tests assert on: every write inside acceptance must
// receive this object and not the repository's own client.
const TX = { marker: 'tx' };

function build(over: { job?: Record<string, unknown>; proposal?: Record<string, unknown> } = {}) {
  const job = {
    id: 'job_1',
    clientProfileId: 'client_profile',
    status: 'PUBLISHED',
    deletedAt: null,
    proposalDeadline: null,
    ...over.job,
  };
  const proposal = {
    id: 'proposal_1',
    jobId: 'job_1',
    providerProfileId: 'provider_profile',
    status: 'SUBMITTED',
    ...over.proposal,
  };

  const proposals = {
    findById: jest.fn().mockResolvedValue(proposal),
    findByJobAndProvider: jest.fn().mockResolvedValue(null),
    findByIdForClient: jest.fn().mockResolvedValue({ id: 'proposal_1', view: 'client' }),
    findByIdForProvider: jest.fn().mockResolvedValue({ id: 'proposal_1', view: 'provider' }),
    listByJob: jest.fn().mockResolvedValue([]),
    countByJob: jest.fn().mockResolvedValue(0),
    listByProvider: jest.fn().mockResolvedValue([]),
    countByProvider: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockImplementation((data) => Promise.resolve({ id: 'proposal_1', ...data })),
    transitionFromSubmitted: jest.fn().mockResolvedValue(1),
    rejectCompeting: jest.fn().mockResolvedValue(0),
    listAttachments: jest.fn().mockResolvedValue([]),
    addAttachment: jest.fn().mockResolvedValue({ id: 'attachment_1' }),
    removeAttachment: jest.fn().mockResolvedValue({ count: 1 }),
    countAttachments: jest.fn().mockResolvedValue(0),
    client: { marker: 'ordinary' },
  };
  const connections = {
    create: jest.fn().mockResolvedValue({ id: 'connection_1' }),
  };
  const profiles = {
    findByUserId: jest.fn().mockResolvedValue(PROVIDER),
    // Maps a profileId back to the User behind it, the way the real
    // ProfilesRepository does — used by ProposalsService to resolve
    // notification recipients.
    findUserIdById: jest.fn().mockImplementation((profileId: string) => {
      if (profileId === PROVIDER.id) return Promise.resolve(PROVIDER.userId);
      if (profileId === CLIENT.id) return Promise.resolve(CLIENT.userId);
      return Promise.resolve(null);
    }),
  };
  const jobs = { findById: jest.fn().mockResolvedValue(job) };
  const jobsService = {
    claimFilled: jest.fn().mockResolvedValue(undefined),
    // Mirrors the real JobsService.getOwnJob ownership check, reusing this
    // same build()'s `profiles`/`jobs` mocks — ProposalsService now
    // delegates to it rather than re-implementing the check, and these
    // tests are exercising that delegation, not JobsService's own logic
    // (which has its own test suite).
    getOwnJob: jest.fn().mockImplementation(async (userId: string, jobId: string) => {
      const callerProfile = await profiles.findByUserId(userId);
      if (!callerProfile) throw new NotFoundException('Profile not found');
      const targetJob = await jobs.findById(jobId);
      if (!targetJob) throw new NotFoundException('Requirement not found');
      if (targetJob.clientProfileId !== callerProfile.id) {
        throw new ForbiddenException('You do not have access to this requirement');
      }
      return { job: targetJob, profile: callerProfile };
    }),
  };
  const mediaService = {
    assertAttachable: jest.fn().mockResolvedValue({ id: 'media_1' }),
    markPrivate: jest.fn().mockResolvedValue(undefined),
    signViewUrl: jest.fn().mockResolvedValue('https://signed.example/file'),
  };
  const prisma = {
    client: { $transaction: jest.fn().mockImplementation((fn) => fn(TX)) },
  };
  const notificationsService = {
    proposalSubmitted: jest.fn().mockResolvedValue(undefined),
    proposalWithdrawn: jest.fn().mockResolvedValue(undefined),
    proposalAccepted: jest.fn().mockResolvedValue(undefined),
    proposalRejected: jest.fn().mockResolvedValue(undefined),
    connectionEstablished: jest.fn().mockResolvedValue(undefined),
  };

  const service = new ProposalsService(
    proposals as never,
    connections as never,
    profiles as never,
    jobs as never,
    jobsService as never,
    mediaService as never,
    notificationsService as never,
    prisma as never,
  );

  return {
    service,
    proposals,
    connections,
    profiles,
    jobs,
    jobsService,
    mediaService,
    notificationsService,
    prisma,
  };
}

const dto: CreateProposalDto = {
  jobId: 'job_1',
  coverMessage: 'A cover message long enough to satisfy the validation rules.',
  proposedPrice: 25000,
  deliveryDays: 7,
};

describe('ProposalsService', () => {
  describe('submit', () => {
    it('creates a proposal for a provider', async () => {
      const { service, proposals } = build();

      await service.submit('user_1', dto);

      const [data] = proposals.create.mock.calls[0];
      expect(data.providerProfileId).toBe('provider_profile');
      expect(data.proposedPrice).toBe(25000);
    });

    it('takes the provider from the authenticated caller, never the request', async () => {
      const { service, proposals } = build();

      await service.submit('user_1', {
        ...dto,
        providerProfileId: 'someone_else',
        status: 'ACCEPTED',
      } as CreateProposalDto);

      const [data] = proposals.create.mock.calls[0];
      expect(data.providerProfileId).toBe('provider_profile');
      // Fields are enumerated rather than spread, so a value the DTO does not
      // declare cannot reach Prisma even if it slips past validation.
      expect(data.status).toBeUndefined();
    });

    it('rejects a client', async () => {
      const { service, profiles, proposals } = build();
      profiles.findByUserId.mockResolvedValue(CLIENT);

      await expect(service.submit('user_2', dto)).rejects.toBeInstanceOf(ForbiddenException);
      expect(proposals.create).not.toHaveBeenCalled();
    });

    it('rejects a provider proposing on their own requirement', async () => {
      const { service, jobs, proposals } = build();
      jobs.findById.mockResolvedValue({
        id: 'job_1',
        clientProfileId: 'provider_profile',
        status: 'PUBLISHED',
        deletedAt: null,
        proposalDeadline: null,
      });

      await expect(service.submit('user_1', dto)).rejects.toBeInstanceOf(ForbiddenException);
      expect(proposals.create).not.toHaveBeenCalled();
    });

    it('404s for a requirement that does not exist', async () => {
      const { service, jobs } = build();
      jobs.findById.mockResolvedValue(null);

      await expect(service.submit('user_1', dto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each(['DRAFT', 'FILLED', 'CANCELLED'])('409s on a %s requirement', async (status) => {
      const { service } = build({ job: { status } });

      await expect(service.submit('user_1', dto)).rejects.toBeInstanceOf(ConflictException);
    });

    // No "409s on a soft-deleted requirement" case: job always comes from
    // JobsRepository.findById, which already filters deletedAt out, so
    // assertAcceptingProposals no longer checks it — see proposals.service.ts.

    it('409s once the proposal deadline has passed', async () => {
      const { service } = build({ job: { proposalDeadline: new Date(Date.now() - 1000) } });

      await expect(service.submit('user_1', dto)).rejects.toBeInstanceOf(ConflictException);
    });

    it('allows a deadline still in the future', async () => {
      const { service, proposals } = build({
        job: { proposalDeadline: new Date(Date.now() + 60_000) },
      });

      await service.submit('user_1', dto);

      expect(proposals.create).toHaveBeenCalled();
    });

    it('reads the requirement state now, not as the frontend last saw it', async () => {
      const { service, jobs } = build({ job: { status: 'FILLED' } });

      await expect(service.submit('user_1', dto)).rejects.toBeInstanceOf(ConflictException);
      // The check is a database read inside the request, which is the only
      // thing that catches a requirement filled while the form was open.
      expect(jobs.findById).toHaveBeenCalledWith('job_1');
    });

    it('409s on a duplicate', async () => {
      const { service, proposals } = build();
      proposals.findByJobAndProvider.mockResolvedValue({ id: 'existing', status: 'SUBMITTED' });

      await expect(service.submit('user_1', dto)).rejects.toBeInstanceOf(ConflictException);
      expect(proposals.create).not.toHaveBeenCalled();
    });

    it('says withdrawal was final rather than reporting a plain duplicate', async () => {
      const { service, proposals } = build();
      proposals.findByJobAndProvider.mockResolvedValue({ id: 'existing', status: 'WITHDRAWN' });

      await expect(service.submit('user_1', dto)).rejects.toThrow(/withdrew/i);
    });

    it('turns a unique violation into a 409, for two simultaneous submissions', async () => {
      const { service, proposals } = build();
      // Both requests pass the pre-check before either writes; only the
      // database can decide between them.
      proposals.create.mockRejectedValue(Object.assign(new Error('duplicate'), { code: 'P2002' }));

      await expect(service.submit('user_1', dto)).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not swallow an unrelated database error', async () => {
      const { service, proposals } = build();
      proposals.create.mockRejectedValue(new Error('connection lost'));

      await expect(service.submit('user_1', dto)).rejects.toThrow('connection lost');
    });

    it('notifies the client who owns the requirement, not the submitting provider', async () => {
      const { service, notificationsService } = build();

      await service.submit('user_1', dto);

      // CLIENT.userId ('user_2'), resolved from job.clientProfileId — not
      // PROVIDER.userId ('user_1'), the caller. A regression that swapped
      // these would tell the wrong person a proposal exists.
      expect(notificationsService.proposalSubmitted).toHaveBeenCalledWith('user_2', {
        jobId: 'job_1',
        proposalId: 'proposal_1',
      });
    });

    it('does not notify anyone if the write itself fails', async () => {
      const { service, proposals, notificationsService } = build();
      proposals.create.mockRejectedValue(new Error('connection lost'));

      await expect(service.submit('user_1', dto)).rejects.toThrow('connection lost');

      expect(notificationsService.proposalSubmitted).not.toHaveBeenCalled();
    });
  });

  describe('accept', () => {
    function asClient(over: Parameters<typeof build>[0] = {}) {
      const ctx = build(over);
      ctx.profiles.findByUserId.mockResolvedValue(CLIENT);
      return ctx;
    }

    it('claims the requirement before anything else is written', async () => {
      const { service, jobsService, proposals, connections } = asClient();

      await service.accept('user_2', 'proposal_1');

      // Order is the mechanism, not a detail: the claim is what serialises
      // two clients accepting two different proposals, and putting it first
      // means the loser rolls back having written nothing.
      const claimOrder = jobsService.claimFilled.mock.invocationCallOrder[0];
      expect(claimOrder).toBeLessThan(
        proposals.transitionFromSubmitted.mock.invocationCallOrder[0],
      );
      expect(claimOrder).toBeLessThan(connections.create.mock.invocationCallOrder[0]);
    });

    it('runs every write through the one transaction client', async () => {
      const { service, jobsService, proposals, connections } = asClient();

      await service.accept('user_2', 'proposal_1');

      expect(jobsService.claimFilled.mock.calls[0][0]).toBe(TX);
      expect(proposals.transitionFromSubmitted.mock.calls[0][0]).toBe(TX);
      expect(proposals.rejectCompeting.mock.calls[0][0]).toBe(TX);
      expect(connections.create.mock.calls[0][0]).toBe(TX);
    });

    it('rejects the competition and creates the connection', async () => {
      const { service, proposals, connections } = asClient();

      const connection = await service.accept('user_2', 'proposal_1');

      expect(proposals.rejectCompeting).toHaveBeenCalledWith(TX, 'job_1', 'proposal_1');
      expect(connections.create.mock.calls[0][1]).toEqual({
        jobId: 'job_1',
        proposalId: 'proposal_1',
        clientProfileId: 'client_profile',
        providerProfileId: 'provider_profile',
      });
      expect(connection).toEqual({ id: 'connection_1' });
    });

    it('rejects self-acceptance defensively — canonical User.id, not Profile.id (Module 01 Slice 2)', async () => {
      // The proposal's providerProfileId is swapped to the accepting
      // client's own profile — findUserIdById resolves that back to
      // CLIENT.userId ('user_2'), the same id doing the accepting. submit()
      // already rejects this upstream; this proves accept()'s own
      // independent re-check fires too, not just the upstream guard.
      const { service, jobsService, connections } = asClient({
        proposal: { providerProfileId: CLIENT.id },
      });

      await expect(service.accept('user_2', 'proposal_1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(jobsService.claimFilled).not.toHaveBeenCalled();
      expect(connections.create).not.toHaveBeenCalled();
    });

    it('conflicts and writes nothing when the requirement was already filled', async () => {
      const { service, jobsService, proposals, connections } = asClient();
      jobsService.claimFilled.mockRejectedValue(new ConflictException('already filled'));

      await expect(service.accept('user_2', 'proposal_1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(proposals.transitionFromSubmitted).not.toHaveBeenCalled();
      expect(connections.create).not.toHaveBeenCalled();
    });

    it('conflicts when the provider withdrew between the read and the write', async () => {
      const { service, proposals, connections } = asClient();
      proposals.transitionFromSubmitted.mockResolvedValue(0);

      await expect(service.accept('user_2', 'proposal_1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      // Rolling back leaves the requirement open, which is right: nothing
      // was agreed.
      expect(proposals.rejectCompeting).not.toHaveBeenCalled();
      expect(connections.create).not.toHaveBeenCalled();
    });

    it('refuses a client who does not own the requirement', async () => {
      const { service, profiles, jobsService } = build();
      profiles.findByUserId.mockResolvedValue({ ...CLIENT, id: 'other_client' });

      await expect(service.accept('user_9', 'proposal_1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(jobsService.claimFilled).not.toHaveBeenCalled();
    });

    it('refuses the provider who wrote it', async () => {
      const { service, jobsService } = build();

      // The caller is the provider, whose profile does not own the job.
      await expect(service.accept('user_1', 'proposal_1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(jobsService.claimFilled).not.toHaveBeenCalled();
    });

    it('accepts after the proposal deadline has passed', async () => {
      const { service, connections } = asClient({
        job: { proposalDeadline: new Date(Date.now() - 60_000) },
      });

      await service.accept('user_2', 'proposal_1');

      // The deadline gates providers submitting, not the client deciding.
      expect(connections.create).toHaveBeenCalled();
    });

    it('notifies the provider of the decision, and both parties of the connection', async () => {
      const { service, notificationsService } = asClient();

      await service.accept('user_2', 'proposal_1');

      // PROVIDER.userId ('user_1'), resolved from proposal.providerProfileId
      // — the party being told the news, not CLIENT.userId, who made the
      // decision.
      expect(notificationsService.proposalAccepted).toHaveBeenCalledWith('user_1', {
        jobId: 'job_1',
        proposalId: 'proposal_1',
      });
      // Both sides, client first: profile.userId (the caller who accepted)
      // then the provider resolved above — see proposals.service.ts's
      // accept().
      expect(notificationsService.connectionEstablished).toHaveBeenCalledWith(
        ['user_2', 'user_1'],
        { connectionId: 'connection_1', jobId: 'job_1', proposalId: 'proposal_1' },
      );
    });

    it('does not notify anyone if the requirement could not be claimed', async () => {
      const { service, jobsService, notificationsService } = asClient();
      jobsService.claimFilled.mockRejectedValue(new ConflictException('already filled'));

      await expect(service.accept('user_2', 'proposal_1')).rejects.toBeInstanceOf(
        ConflictException,
      );

      expect(notificationsService.proposalAccepted).not.toHaveBeenCalled();
      expect(notificationsService.connectionEstablished).not.toHaveBeenCalled();
    });
  });

  describe('reject', () => {
    it('moves a submitted proposal to REJECTED', async () => {
      const { service, profiles, proposals } = build();
      profiles.findByUserId.mockResolvedValue(CLIENT);

      await service.reject('user_2', 'proposal_1');

      const [client, id, to] = proposals.transitionFromSubmitted.mock.calls[0];
      expect(to).toBe('REJECTED');
      expect(id).toBe('proposal_1');
      // The ordinary client, not a transaction: rejection is one write.
      expect(client).toBe(proposals.client);
    });

    it('conflicts when the proposal was already decided', async () => {
      const { service, profiles, proposals } = build();
      profiles.findByUserId.mockResolvedValue(CLIENT);
      proposals.transitionFromSubmitted.mockResolvedValue(0);
      proposals.findById.mockResolvedValue({
        id: 'proposal_1',
        jobId: 'job_1',
        providerProfileId: 'provider_profile',
        status: 'WITHDRAWN',
      });

      await expect(service.reject('user_2', 'proposal_1')).rejects.toThrow(/withdrawn/i);
    });

    it('refuses a client who does not own the requirement', async () => {
      const { service, profiles } = build();
      profiles.findByUserId.mockResolvedValue({ ...CLIENT, id: 'other_client' });

      await expect(service.reject('user_9', 'proposal_1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('notifies the provider who was turned down, not the client who decided', async () => {
      const { service, profiles, notificationsService } = build();
      profiles.findByUserId.mockResolvedValue(CLIENT);

      await service.reject('user_2', 'proposal_1');

      expect(notificationsService.proposalRejected).toHaveBeenCalledWith('user_1', {
        jobId: 'job_1',
        proposalId: 'proposal_1',
      });
    });
  });

  describe('withdraw', () => {
    it('moves the provider’s own proposal to WITHDRAWN', async () => {
      const { service, proposals } = build();

      await service.withdraw('user_1', 'proposal_1');

      const [, , to] = proposals.transitionFromSubmitted.mock.calls[0];
      expect(to).toBe('WITHDRAWN');
    });

    it('conflicts when the client accepted first', async () => {
      const { service, proposals } = build();
      proposals.transitionFromSubmitted.mockResolvedValue(0);
      proposals.findById.mockResolvedValueOnce({
        id: 'proposal_1',
        jobId: 'job_1',
        providerProfileId: 'provider_profile',
        status: 'SUBMITTED',
      });
      proposals.findById.mockResolvedValueOnce({
        id: 'proposal_1',
        jobId: 'job_1',
        providerProfileId: 'provider_profile',
        status: 'ACCEPTED',
      });

      await expect(service.withdraw('user_1', 'proposal_1')).rejects.toThrow(/accepted/i);
    });

    it('refuses another provider’s proposal', async () => {
      const { service, profiles, proposals } = build();
      profiles.findByUserId.mockResolvedValue({ ...PROVIDER, id: 'other_provider' });

      await expect(service.withdraw('user_9', 'proposal_1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(proposals.transitionFromSubmitted).not.toHaveBeenCalled();
    });

    it('refuses to withdraw a direct contract offer — that goes through DirectContractsService.decline', async () => {
      const { service, proposals } = build({ job: { isDirect: true } });

      await expect(service.withdraw('user_1', 'proposal_1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(proposals.transitionFromSubmitted).not.toHaveBeenCalled();
    });

    it('notifies the client who owns the requirement, not the withdrawing provider', async () => {
      const { service, notificationsService } = build();

      await service.withdraw('user_1', 'proposal_1');

      expect(notificationsService.proposalWithdrawn).toHaveBeenCalledWith('user_2', {
        jobId: 'job_1',
        proposalId: 'proposal_1',
      });
    });
  });

  describe('reads', () => {
    it('gives the provider their own view and the client theirs', async () => {
      const asProvider = build();
      await expect(asProvider.service.findById('user_1', 'proposal_1')).resolves.toEqual({
        id: 'proposal_1',
        view: 'provider',
      });

      const asClient = build();
      asClient.profiles.findByUserId.mockResolvedValue(CLIENT);
      await expect(asClient.service.findById('user_2', 'proposal_1')).resolves.toEqual({
        id: 'proposal_1',
        view: 'client',
      });
    });

    it('refuses a stranger to both sides', async () => {
      const { service, profiles } = build();
      profiles.findByUserId.mockResolvedValue({ ...PROVIDER, id: 'nobody' });

      await expect(service.findById('user_9', 'proposal_1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('scopes a proposal read to the requirement in the path', async () => {
      const { service, profiles, proposals } = build();
      profiles.findByUserId.mockResolvedValue(CLIENT);
      // A proposal that exists, but on someone else's requirement. Without
      // the jobId check a client could read any proposal on the platform by
      // pairing it with a requirement they own.
      proposals.findById.mockResolvedValue({
        id: 'proposal_9',
        jobId: 'someone_elses_job',
        providerProfileId: 'provider_profile',
        status: 'SUBMITTED',
      });

      await expect(service.findForJob('user_2', 'job_1', 'proposal_9')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuses a proposal list for a requirement the caller does not own', async () => {
      const { service, profiles } = build();
      profiles.findByUserId.mockResolvedValue({ ...CLIENT, id: 'other_client' });

      await expect(
        service.listForJob('user_9', 'job_1', { page: 1, limit: 20 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('paginates the provider’s own proposals', async () => {
      const { service, proposals } = build();
      proposals.countByProvider.mockResolvedValue(3);

      const result = await service.listMine('user_1', { page: 2, limit: 2 });

      expect(proposals.listByProvider).toHaveBeenCalledWith('provider_profile', 2, 2);
      expect(result.pagination).toMatchObject({ total: 3, totalPages: 2, hasNext: false });
    });
  });

  describe('attachments', () => {
    it('marks an attached file private and orders it after the existing ones', async () => {
      const { service, proposals, mediaService } = build();
      proposals.countAttachments.mockResolvedValue(2);

      await service.addAttachment('user_1', 'proposal_1', 'media_1');

      expect(mediaService.assertAttachable).toHaveBeenCalledWith('user_1', 'media_1');
      expect(mediaService.markPrivate).toHaveBeenCalledWith('media_1');
      expect(proposals.addAttachment).toHaveBeenCalledWith('proposal_1', 'media_1', 2);
    });

    it('refuses to change a decided proposal', async () => {
      const { service, proposals } = build({ proposal: { status: 'ACCEPTED' } });

      await expect(service.addAttachment('user_1', 'proposal_1', 'media_1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(proposals.addAttachment).not.toHaveBeenCalled();
    });

    it('caps the attachment count', async () => {
      const { service, proposals } = build();
      proposals.countAttachments.mockResolvedValue(5);

      await expect(service.addAttachment('user_1', 'proposal_1', 'media_1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(proposals.addAttachment).not.toHaveBeenCalled();
    });

    it('refuses to attach to another provider’s proposal', async () => {
      const { service, profiles, mediaService } = build();
      profiles.findByUserId.mockResolvedValue({ ...PROVIDER, id: 'other_provider' });

      await expect(service.addAttachment('user_9', 'proposal_1', 'media_1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(mediaService.assertAttachable).not.toHaveBeenCalled();
    });

    it('404s when detaching something that is not on this proposal', async () => {
      const { service, proposals } = build();
      proposals.removeAttachment.mockResolvedValue({ count: 0 });

      await expect(
        service.removeAttachment('user_1', 'proposal_1', 'attachment_9'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('never leaks the storage path when listing', async () => {
      const { service, proposals } = build();
      proposals.listAttachments.mockResolvedValue([
        {
          id: 'attachment_1',
          displayOrder: 0,
          mediaId: 'media_1',
          media: {
            objectKey: 'users/user_1/secret-path',
            status: 'UPLOADED',
            originalFileName: 'quote.pdf',
            mimeType: 'application/pdf',
          },
        },
      ]);

      const [attachment] = await service.listAttachments('user_1', 'proposal_1');

      expect(attachment).not.toHaveProperty('media');
      expect(JSON.stringify(attachment)).not.toContain('secret-path');
      expect(attachment.fileName).toBe('quote.pdf');
    });

    it('lets the requirement owner read the provider’s attachments', async () => {
      const { service, profiles, proposals } = build();
      profiles.findByUserId.mockResolvedValue(CLIENT);

      await service.listAttachments('user_2', 'proposal_1');

      expect(proposals.listAttachments).toHaveBeenCalledWith('proposal_1');
    });

    it('refuses a stranger', async () => {
      const { service, profiles } = build();
      profiles.findByUserId.mockResolvedValue({ ...PROVIDER, id: 'nobody' });

      await expect(service.listAttachments('user_9', 'proposal_1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
