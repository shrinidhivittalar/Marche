import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MediaRepository } from './media.repository';
import { StorageService } from './storage.service';
import {
  ALLOWED_MIME_TYPES,
  SIGNATURE_HEAD_BYTES,
  matchesSignature,
  maxBytesFor,
  mediaConfig,
} from './media.config';
import type { RequestUploadDto } from './dto/media.dto';
import type { Media } from '@marche/db';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly mediaRepository: MediaRepository,
    private readonly storage: StorageService,
  ) {}

  /**
   * Step 1: authorise an upload and hand back a short-lived URL.
   *
   * The row is created PENDING. If the browser never uploads, that row is an
   * abandoned upload and gets swept — it is never a file, and can never be
   * attached to anything.
   */
  async requestUpload(userId: string, dto: RequestUploadDto) {
    if (!ALLOWED_MIME_TYPES.includes(dto.mimeType)) {
      throw new BadRequestException('That file type is not supported');
    }

    const limit = maxBytesFor(dto.mimeType);
    if (dto.sizeBytes > limit) {
      throw new BadRequestException(
        `That file is too large. The limit is ${Math.floor(limit / (1024 * 1024))}MB.`,
      );
    }

    // Every request is a chance to clear up after abandoned ones. Cheap,
    // self-limiting, and it needs no scheduler — which the app does not have.
    void this.sweepAbandonedUploads();

    // The client never chooses this. An attacker-supplied key is how you get
    // path traversal, collisions, and one user overwriting another's file.
    // The original name survives as metadata only.
    const objectKey = `users/${userId}/${randomUUID()}`;

    const media = await this.mediaRepository.create({
      ownerUserId: userId,
      objectKey,
      originalFileName: dto.fileName,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      status: 'PENDING',
      visibility: 'PUBLIC',
    });

    const uploadUrl = await this.storage.createUploadUrl(
      objectKey,
      dto.mimeType,
      dto.sizeBytes,
      mediaConfig.uploadUrlTtlSeconds,
    );

    return { mediaId: media.id, uploadUrl, expiresIn: mediaConfig.uploadUrlTtlSeconds };
  }

  /**
   * Step 3: confirm the file actually arrived, and is what it claimed to be.
   *
   * Nothing reaches UPLOADED without this, and only UPLOADED media can be
   * attached to a portfolio, service or job.
   */
  async completeUpload(userId: string, mediaId: string): Promise<Media> {
    const media = await this.getOwned(userId, mediaId);

    // Idempotent. A double-clicked confirm, or a retried request, should not
    // be an error — the desired state is already true.
    if (media.status === 'UPLOADED') {
      return media;
    }
    if (media.status !== 'PENDING') {
      throw new BadRequestException('That upload can no longer be completed');
    }

    const object = await this.storage.head(media.objectKey);
    if (!object) {
      // The URL was issued and nothing was uploaded. Marked FAILED rather
      // than left PENDING, so it is not swept as though it were merely stale
      // and so a retry starts cleanly.
      await this.mediaRepository.update(mediaId, { status: 'FAILED' });
      throw new BadRequestException('No file was uploaded');
    }

    // Size as storage measured it, not as the client declared it. A signed
    // ContentLength makes a mismatch unlikely, but "unlikely" is not a
    // security control.
    const limit = maxBytesFor(media.mimeType);
    if (object.sizeBytes > limit) {
      await this.rejectUpload(mediaId, media.objectKey);
      throw new BadRequestException('The uploaded file exceeds the size limit');
    }

    // The declared MIME type is a claim. This is the check that catches a
    // renamed executable, and the only reason the API touches the object at
    // all — and it reads bytes, not the file.
    const head = await this.storage.readHead(media.objectKey, SIGNATURE_HEAD_BYTES);
    if (!head || !matchesSignature(media.mimeType, head)) {
      await this.rejectUpload(mediaId, media.objectKey);
      throw new BadRequestException("The uploaded file isn't a valid " + media.mimeType);
    }

    return this.mediaRepository.update(mediaId, {
      status: 'UPLOADED',
      sizeBytes: object.sizeBytes,
    });
  }

  async findOwned(userId: string, mediaId: string): Promise<Media> {
    return this.getOwned(userId, mediaId);
  }

  async remove(userId: string, mediaId: string): Promise<void> {
    const media = await this.getOwned(userId, mediaId);

    // The row is soft-deleted and the object removed. The row survives
    // because something may still reference this id, and a dangling
    // reference to a known-deleted row is far easier to reason about than a
    // reference to a row that vanished.
    await this.mediaRepository.softDelete(media.id);
    await this.storage.delete(media.objectKey);
  }

  /**
   * The check every other module relies on before attaching a file.
   *
   * Ownership alone is not enough: media must also have actually arrived.
   * Without the status check, a provider could attach a PENDING row and put
   * a permanently broken image on a public listing.
   */
  async assertAttachable(userId: string, mediaId: string): Promise<Media> {
    const media = await this.getOwned(userId, mediaId);
    if (media.status !== 'UPLOADED') {
      throw new BadRequestException('That file has not finished uploading');
    }
    return media;
  }

  private async getOwned(userId: string, mediaId: string): Promise<Media> {
    const media = await this.mediaRepository.findById(mediaId);
    if (!media) {
      throw new NotFoundException('File not found');
    }
    // Deliberately a 403 after a successful lookup rather than a 404: the
    // caller already knows the id exists if they guessed it, and ownership
    // is the thing being enforced. Nothing about the file is revealed.
    if (media.ownerUserId !== userId) {
      throw new ForbiddenException('You do not have access to that file');
    }
    return media;
  }

  private async rejectUpload(mediaId: string, objectKey: string): Promise<void> {
    await this.mediaRepository.update(mediaId, { status: 'FAILED' });
    await this.storage.delete(objectKey);
  }

  /**
   * Removes rows for uploads that were authorised and never happened.
   *
   * Fire-and-forget on purpose: this is housekeeping, and a failure here
   * must never turn a user's upload request into an error. Bounded per run
   * so a large backlog is cleared over several requests rather than one
   * slow one.
   */
  private async sweepAbandonedUploads(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - mediaConfig.orphanAgeMinutes * 60_000);
      const stale = await this.mediaRepository.findStalePending(cutoff, 20);

      for (const media of stale) {
        // Deleted from storage too: a presigned URL may have completed after
        // the row went stale, which would otherwise leave a paid-for object
        // nothing references.
        await this.storage.delete(media.objectKey);
        await this.mediaRepository.update(media.id, { status: 'FAILED' });
      }

      if (stale.length > 0) {
        this.logger.log(`Swept ${stale.length} abandoned upload(s)`);
      }
    } catch (err) {
      this.logger.warn(
        'Abandoned-upload sweep failed; will retry on the next request',
        err as Error,
      );
    }
  }
}
