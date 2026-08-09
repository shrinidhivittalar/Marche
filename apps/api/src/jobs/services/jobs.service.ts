import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProfilesRepository } from '../../profiles/repositories/profiles.repository';
import { CategoriesRepository } from '../../marketplace/repositories/categories.repository';
import { CategoriesService } from '../../marketplace/services/categories.service';
import { MediaService } from '../../media/media.service';
import { assertClientRole } from '../../profiles/profile-access.util';
import { JobsRepository, type JobSearchFilters } from '../repositories/jobs.repository';
import { paginate } from '../../marketplace/pagination';
import type { CreateJobDto, UpdateJobDto } from '../dto/job.dto';
import type { SearchJobsDto } from '../dto/search-jobs.dto';
import type { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';
import type { Job, JobStatus } from '@marche/db';

// Which statuses a job may move to from where. The whole lifecycle is one
// table rather than a scatter of `if (status === ...)` checks, so an
// invalid transition is impossible to reach by adding a new code path and
// forgetting a guard.
//
// FILLED and CANCELLED have no outgoing edges: both are terminal in Phase
// 1. A cancelled requirement is reposted by creating a new one, which
// keeps the original's history intact rather than overwriting it.
const ALLOWED_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  DRAFT: ['PUBLISHED', 'CANCELLED'],
  PUBLISHED: ['FILLED', 'CANCELLED'],
  FILLED: [],
  CANCELLED: [],
};

// Editing is allowed while a job is still live in some sense. A filled or
// cancelled requirement is history: providers proposed against what it
// said, and rewriting it afterwards would silently change what they
// agreed to.
const EDITABLE_STATUSES: JobStatus[] = ['DRAFT', 'PUBLISHED'];

@Injectable()
export class JobsService {
  constructor(
    private readonly jobsRepository: JobsRepository,
    private readonly profilesRepository: ProfilesRepository,
    private readonly categoriesRepository: CategoriesRepository,
    private readonly categoriesService: CategoriesService,
    private readonly mediaService: MediaService,
  ) {}

  // ---------- client-owned writes ----------

  async create(userId: string, dto: CreateJobDto): Promise<Job> {
    const profile = await this.getOwnProfile(userId);
    assertClientRole(profile.user.role);

    await this.assertCategoryExists(dto.categoryId);

    // Fields are enumerated rather than spread. The DTO already cannot
    // carry clientProfileId or status past the ValidationPipe, but listing
    // them out means a field added to the DTO later reaches the database
    // only when someone adds it here deliberately. status and publishedAt
    // are left to their schema defaults — a requirement is never born live.
    return this.jobsRepository.create({
      clientProfileId: profile.id,
      categoryId: dto.categoryId,
      title: dto.title,
      description: dto.description,
      budgetMin: dto.budgetMin,
      budgetMax: dto.budgetMax,
      location: dto.location,
      eventDate: dto.eventDate ? new Date(dto.eventDate) : undefined,
    });
  }

  async update(userId: string, jobId: string, dto: UpdateJobDto): Promise<Job> {
    const { job } = await this.getOwnJob(userId, jobId);

    if (!EDITABLE_STATUSES.includes(job.status)) {
      throw new BadRequestException(
        `A ${job.status.toLowerCase()} requirement can no longer be edited`,
      );
    }

    if (dto.categoryId) {
      await this.assertCategoryExists(dto.categoryId);
    }

    return this.jobsRepository.update(job.id, {
      title: dto.title,
      description: dto.description,
      budgetMin: dto.budgetMin,
      budgetMax: dto.budgetMax,
      location: dto.location,
      eventDate: dto.eventDate ? new Date(dto.eventDate) : undefined,
      ...(dto.categoryId ? { category: { connect: { id: dto.categoryId } } } : {}),
    });
  }

  async publish(userId: string, jobId: string): Promise<Job> {
    const { job, profile } = await this.getOwnJob(userId, jobId);

    // Idempotent: publishing an already-published requirement is a no-op
    // rather than an error, so a double-clicked button doesn't fail.
    if (job.status === 'PUBLISHED') {
      return job;
    }

    this.assertTransition(job.status, 'PUBLISHED');

    // Re-checked at publish, not just at create. A client can be suspended
    // between drafting and publishing, and publish is the moment the
    // requirement becomes visible to everyone.
    assertClientRole(profile.user.role);

    // Stamped once, on first publish, and never rewritten. There is no
    // unpublish in Phase 1, but this keeps the rule true if one arrives.
    return this.jobsRepository.update(job.id, {
      status: 'PUBLISHED',
      ...(job.publishedAt === null ? { publishedAt: new Date() } : {}),
    });
  }

  async cancel(userId: string, jobId: string): Promise<Job> {
    const { job } = await this.getOwnJob(userId, jobId);

    if (job.status === 'CANCELLED') {
      return job;
    }

    this.assertTransition(job.status, 'CANCELLED');

    return this.jobsRepository.update(job.id, {
      status: 'CANCELLED',
      cancelledAt: new Date(),
    });
  }

  /**
   * Removes a requirement outright.
   *
   * Drafts only. A published requirement is cancelled instead: providers
   * may already have read it, and once Module 5 exists they may have
   * proposed against it. "Delete" and "cancel" would otherwise be two names
   * for the same outcome, which is how a reviewer ends up unable to say
   * which one a screen should call.
   */
  async remove(userId: string, jobId: string): Promise<void> {
    const { job } = await this.getOwnJob(userId, jobId);

    if (job.status !== 'DRAFT') {
      throw new BadRequestException('Only a draft can be deleted. Cancel the requirement instead.');
    }

    // Soft delete, matching Service: a row referenced by anything later
    // must not disappear from under it.
    await this.jobsRepository.softDelete(job.id);
  }

  /**
   * Marks a requirement as filled. Module 5 only.
   *
   * Deliberately not reachable from any route in this module: FILLED is
   * the consequence of accepting a proposal, so the transition belongs to
   * the workflow that accepts one. A client hitting an endpoint to declare
   * their own job filled would let the two sides disagree.
   *
   * Called directly rather than through an event, because no event
   * infrastructure exists and inventing one for a single caller would be
   * the kind of abstraction CLAUDE.md rules out.
   */
  async markFilled(jobId: string): Promise<Job> {
    const job = await this.jobsRepository.findById(jobId);
    if (!job) {
      throw new NotFoundException('Requirement not found');
    }

    this.assertTransition(job.status, 'FILLED');
    return this.jobsRepository.update(job.id, { status: 'FILLED' });
  }

  // ---------- client-owned reads ----------

  async listMine(userId: string, pagination: PaginationQueryDto) {
    const profile = await this.getOwnProfile(userId);
    const { page, limit } = pagination;

    const [data, total] = await Promise.all([
      this.jobsRepository.listByProfile(profile.id, (page - 1) * limit, limit),
      this.jobsRepository.countByProfile(profile.id),
    ]);

    return paginate(data, total, page, limit);
  }

  async findMineById(userId: string, jobId: string) {
    // Ownership first, then the fuller read. Two queries rather than one,
    // but the alternative is a read that returns data before deciding
    // whether the caller was allowed to have it.
    await this.getOwnJob(userId, jobId);

    const job = await this.jobsRepository.findByIdForOwner(jobId);
    if (!job) {
      throw new NotFoundException('Requirement not found');
    }
    return job;
  }

  // ---------- attachments ----------

  // Capped for the same reason service images are: a requirement with
  // forty files attached is a document dump, not a brief.
  private static readonly MAX_ATTACHMENTS = 10;

  async addAttachment(userId: string, jobId: string, mediaId: string) {
    const { job } = await this.getOwnJob(userId, jobId);

    if (!EDITABLE_STATUSES.includes(job.status)) {
      throw new BadRequestException(
        `A ${job.status.toLowerCase()} requirement can no longer be changed`,
      );
    }

    // Both halves of the rule: the file is this user's, and it finished
    // uploading. Without the second, a requirement could carry a file that
    // never arrived.
    await this.mediaService.assertAttachable(userId, mediaId);

    const existing = await this.jobsRepository.countAttachments(job.id);
    if (existing >= JobsService.MAX_ATTACHMENTS) {
      throw new BadRequestException(
        `A requirement can have at most ${JobsService.MAX_ATTACHMENTS} attachments`,
      );
    }

    // Marked private because of where it landed, not because the uploader
    // said so. See MediaService.markPrivate.
    await this.mediaService.markPrivate(mediaId);

    return this.jobsRepository.addAttachment(job.id, mediaId, existing);
  }

  async removeAttachment(userId: string, jobId: string, attachmentId: string): Promise<void> {
    const { job } = await this.getOwnJob(userId, jobId);

    const result = await this.jobsRepository.removeAttachment(job.id, attachmentId);
    if (result.count === 0) {
      throw new NotFoundException('Attachment not found on this requirement');
    }
    // The Media row is deliberately left alone. The file belongs to the
    // user, not to this requirement, and they may want to attach it
    // elsewhere. Deleting it is a separate, explicit action.
  }

  /**
   * Attachments for a requirement, with signed URLs.
   *
   * Authenticated callers only, and never on the public requirement route:
   * a guest can read what a client is asking for, but not download their
   * floor plan. The owner sees their own in any state; everyone else sees
   * them only while the requirement is actually published, so cancelling
   * withdraws the files along with the ask.
   */
  async listAttachments(userId: string, jobId: string) {
    const job = await this.jobsRepository.findById(jobId);
    if (!job) {
      throw new NotFoundException('Requirement not found');
    }

    const profile = await this.getOwnProfile(userId);
    const isOwner = job.clientProfileId === profile.id;

    if (!isOwner) {
      // Re-read through the public filter rather than checking status
      // inline: that way "who may see this" has one definition, and a
      // suspended client's attachments disappear with their requirement.
      const visible = await this.jobsRepository.findPublicById(jobId);
      if (!visible) {
        throw new ForbiddenException('You do not have access to this requirement');
      }
    }

    const attachments = await this.jobsRepository.listAttachments(jobId);

    return Promise.all(
      // media is dropped rather than spread: objectKey is the storage path
      // and no client needs it.
      attachments.map(async ({ media, ...attachment }) => ({
        ...attachment,
        fileName: media?.originalFileName ?? null,
        mimeType: media?.mimeType ?? null,
        url: await this.mediaService.signViewUrl(media),
      })),
    );
  }

  // ---------- public reads ----------

  async findPublicById(jobId: string) {
    const job = await this.jobsRepository.findPublicById(jobId);
    if (!job) {
      // Deliberately indistinguishable from "does not exist". A draft or
      // cancelled requirement answering differently would confirm it is
      // there, which is exactly what hiding it is meant to prevent.
      throw new NotFoundException('Requirement not found');
    }
    return job;
  }

  async search(dto: SearchJobsDto) {
    const filters = await this.buildFilters(dto);
    const { page, limit } = dto;

    const [data, total] = await Promise.all([
      this.jobsRepository.search(filters, dto.sort, (page - 1) * limit, limit),
      this.jobsRepository.countSearch(filters),
    ]);

    return paginate(data, total, page, limit);
  }

  // ---------- helpers ----------

  private async buildFilters(dto: SearchJobsDto): Promise<JobSearchFilters> {
    let categoryIds: string[] | undefined;
    if (dto.category) {
      // Resolves a slug to the category and its children, so filtering by
      // a parent returns everything beneath it. Reused from Marketplace
      // rather than reimplemented — it is the same taxonomy.
      const resolved = await this.categoriesService.resolveFilterIds(dto.category);
      if (!resolved) {
        throw new BadRequestException(`Unknown category "${dto.category}"`);
      }
      categoryIds = resolved;
    }

    return {
      q: dto.q,
      categoryIds,
      location: dto.location,
      minBudget: dto.minBudget,
      maxBudget: dto.maxBudget,
      eventFrom: dto.eventFrom ? new Date(dto.eventFrom) : undefined,
      eventUntil: dto.eventUntil ? new Date(dto.eventUntil) : undefined,
    };
  }

  private assertTransition(from: JobStatus, to: JobStatus): void {
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw new BadRequestException(
        `A ${from.toLowerCase()} requirement cannot become ${to.toLowerCase()}`,
      );
    }
  }

  private async getOwnProfile(userId: string) {
    const profile = await this.profilesRepository.findByUserId(userId);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return profile;
  }

  /**
   * The ownership gate every mutation goes through.
   *
   * A 404 for a job that exists but belongs to someone else would leak
   * nothing, but 403 is what the rest of the codebase returns once a
   * resource has been found (see assertOwnership), and consistency matters
   * more here than the marginal secrecy.
   */
  private async getOwnJob(userId: string, jobId: string) {
    const profile = await this.getOwnProfile(userId);
    const job = await this.jobsRepository.findById(jobId);

    if (!job) {
      throw new NotFoundException('Requirement not found');
    }
    if (job.clientProfileId !== profile.id) {
      throw new ForbiddenException('You do not have access to this requirement');
    }

    return { job, profile };
  }

  private async assertCategoryExists(categoryId: string): Promise<void> {
    const category = await this.categoriesRepository.findById(categoryId);
    if (!category) {
      throw new BadRequestException('Category not found');
    }
  }
}
