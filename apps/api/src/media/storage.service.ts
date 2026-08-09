import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// The only place in the codebase that talks to object storage. Every module
// that needs a file goes through MediaService, which goes through here —
// so Profiles, Marketplace and later Jobs never learn what a bucket is.
//
// This is a client module, not a provider abstraction. Cloudflare R2 speaks
// the S3 API, so one S3 client covers R2 in production and MinIO locally
// with nothing but a different endpoint. A swappable interface would be an
// abstraction over a single implementation, which CLAUDE.md rules out until
// there is a second real one.

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private cachedClient: S3Client | null = null;

  /**
   * Whether storage is configured at all. Lets callers and health checks
   * distinguish "uploads are switched off here" from "uploads are broken".
   */
  static isConfigured(): boolean {
    return Boolean(
      process.env.STORAGE_ENDPOINT &&
      process.env.STORAGE_ACCESS_KEY_ID &&
      process.env.STORAGE_SECRET_ACCESS_KEY &&
      process.env.STORAGE_BUCKET,
    );
  }

  // Built on first use, not in the constructor. Failing at boot would be
  // right for infrastructure the whole app depends on — but nothing outside
  // this module needs storage, and refusing to start the API because
  // uploads are unconfigured would take down auth, profiles and the
  // marketplace along with it. Only media requests fail, and they fail with
  // a message that names the missing variables.
  private get client(): S3Client {
    if (this.cachedClient) return this.cachedClient;

    if (!StorageService.isConfigured()) {
      throw new InternalServerErrorException(
        'File uploads are not available: storage is not configured on this server.',
      );
    }

    this.cachedClient = new S3Client({
      endpoint: process.env.STORAGE_ENDPOINT,
      // R2 ignores region but the SDK requires one; "auto" is what
      // Cloudflare documents. MinIO accepts it too.
      region: process.env.STORAGE_REGION ?? 'auto',
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY as string,
      },
      // MinIO serves buckets as a path segment rather than a subdomain.
      // R2 works either way, so this is safe to leave on for both.
      forcePathStyle: true,
    });
    return this.cachedClient;
  }

  private get bucket(): string {
    return process.env.STORAGE_BUCKET as string;
  }

  /**
   * A short-lived URL the browser PUTs the file to directly. The API never
   * sees the bytes — that is the entire point of the presigned approach.
   *
   * The content type and length are signed into the URL, so a client cannot
   * request permission for a small JPEG and then upload a large executable.
   */
  async createUploadUrl(
    objectKey: string,
    mimeType: string,
    sizeBytes: number,
    ttlSeconds: number,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: mimeType,
      ContentLength: sizeBytes,
    });
    return getSignedUrl(this.client, command, { expiresIn: ttlSeconds });
  }

  /**
   * Size and content type as storage sees them, or null when the object is
   * absent. This is how "the client called complete but never uploaded" is
   * detected, so a missing object is an expected answer rather than an error.
   */
  async head(objectKey: string): Promise<{ sizeBytes: number; mimeType?: string } | null> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      );
      return { sizeBytes: res.ContentLength ?? 0, mimeType: res.ContentType };
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name;
      if (name === 'NotFound' || name === 'NoSuchKey') return null;
      this.logger.error(`Failed to stat ${objectKey}`, err as Error);
      throw new InternalServerErrorException('Could not verify the uploaded file');
    }
  }

  /**
   * The first few bytes only, via a Range request, for signature checking.
   *
   * Deliberately not a full download: verifying a 20MB PDF must not move
   * 20MB through the API that was designed never to touch the upload.
   */
  async readHead(objectKey: string, byteCount: number): Promise<Uint8Array | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
          Range: `bytes=0-${byteCount - 1}`,
        }),
      );
      const bytes = await res.Body?.transformToByteArray();
      return bytes ?? null;
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name;
      if (name === 'NotFound' || name === 'NoSuchKey') return null;
      this.logger.error(`Failed to read ${objectKey}`, err as Error);
      throw new InternalServerErrorException('Could not verify the uploaded file');
    }
  }

  /**
   * Best-effort removal. A failure here is logged rather than thrown: the
   * caller is usually cleaning up after a rejected upload, and turning that
   * into a 500 would report failure for an operation that already succeeded
   * in the way that matters — the file is not usable either way.
   */
  async delete(objectKey: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
    } catch (err) {
      this.logger.warn(`Could not delete ${objectKey}; it may need a manual sweep`, err as Error);
    }
  }
}
