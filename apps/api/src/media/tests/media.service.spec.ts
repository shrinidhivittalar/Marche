import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MediaService } from '../media.service';
import { MediaRepository } from '../media.repository';
import { StorageService } from '../storage.service';
import { matchesSignature, maxBytesFor } from '../media.config';

const JPEG_HEAD = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG_HEAD = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0,
]);
// A Windows executable renamed to .jpg — the case the whole signature check
// exists for.
const EXE_HEAD = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

const OWNER = 'user_1';
const media = (over: Record<string, unknown> = {}) => ({
  id: 'media_1',
  ownerUserId: OWNER,
  objectKey: `users/${OWNER}/abc`,
  originalFileName: 'photo.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 1000,
  status: 'PENDING',
  visibility: 'PUBLIC',
  deletedAt: null,
  ...over,
});

function build() {
  const repo = {
    create: jest.fn().mockImplementation((data) => Promise.resolve({ id: 'media_1', ...data })),
    findById: jest.fn().mockResolvedValue(media()),
    update: jest.fn().mockImplementation((id, data) => Promise.resolve({ ...media(), ...data })),
    softDelete: jest.fn().mockResolvedValue(media({ status: 'DELETED' })),
    findStalePending: jest.fn().mockResolvedValue([]),
  };
  const storage = {
    createUploadUrl: jest.fn().mockResolvedValue('https://storage.example/signed'),
    head: jest.fn().mockResolvedValue({ sizeBytes: 1000, mimeType: 'image/jpeg' }),
    readHead: jest.fn().mockResolvedValue(JPEG_HEAD),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const service = new MediaService(
    repo as unknown as MediaRepository,
    storage as unknown as StorageService,
  );
  return { service, repo, storage };
}

describe('media.config', () => {
  describe('signature checking', () => {
    it('accepts bytes that match the declared type', () => {
      expect(matchesSignature('image/jpeg', JPEG_HEAD)).toBe(true);
      expect(matchesSignature('image/png', PNG_HEAD)).toBe(true);
    });

    // The reason this check exists at all: a declared MIME type is a claim,
    // and renaming an executable is the oldest trick there is.
    it('rejects an executable claiming to be a JPEG', () => {
      expect(matchesSignature('image/jpeg', EXE_HEAD)).toBe(false);
    });

    it('rejects a PNG claiming to be a JPEG', () => {
      expect(matchesSignature('image/jpeg', PNG_HEAD)).toBe(false);
    });

    it('rejects truncated data rather than guessing', () => {
      expect(matchesSignature('image/png', new Uint8Array([0x89, 0x50]))).toBe(false);
    });
  });

  it('applies a different size limit to images and documents', () => {
    expect(maxBytesFor('image/jpeg')).toBeLessThan(maxBytesFor('application/pdf'));
  });
});

describe('MediaService', () => {
  describe('requestUpload', () => {
    it('generates the object key itself and ignores any client filename', async () => {
      const { service, repo } = build();
      await service.requestUpload(OWNER, {
        fileName: '../../etc/passwd',
        mimeType: 'image/jpeg',
        sizeBytes: 1000,
      });

      const written = repo.create.mock.calls[0][0];
      // A client-chosen path is how traversal and collisions happen. The
      // supplied name survives only as metadata.
      expect(written.objectKey).toMatch(new RegExp(`^users/${OWNER}/[0-9a-f-]{36}$`));
      expect(written.objectKey).not.toContain('..');
      expect(written.originalFileName).toBe('../../etc/passwd');
    });

    it('creates the row as PENDING, never as uploaded', async () => {
      const { service, repo } = build();
      await service.requestUpload(OWNER, {
        fileName: 'a.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1000,
      });
      expect(repo.create.mock.calls[0][0].status).toBe('PENDING');
    });

    it('rejects a disallowed type before issuing a URL', async () => {
      const { service, storage } = build();
      await expect(
        service.requestUpload(OWNER, {
          fileName: 'x.zip',
          mimeType: 'application/zip',
          sizeBytes: 10,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.createUploadUrl).not.toHaveBeenCalled();
    });

    it('rejects an oversized file before issuing a URL', async () => {
      const { service, storage } = build();
      await expect(
        service.requestUpload(OWNER, {
          fileName: 'big.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 999_000_000,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.createUploadUrl).not.toHaveBeenCalled();
    });

    it('signs the size and type into the URL so they cannot be swapped later', async () => {
      const { service, storage } = build();
      await service.requestUpload(OWNER, {
        fileName: 'a.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 2048,
      });
      const [, mimeType, sizeBytes] = storage.createUploadUrl.mock.calls[0];
      expect(mimeType).toBe('image/jpeg');
      expect(sizeBytes).toBe(2048);
    });
  });

  describe('completeUpload', () => {
    it('marks a genuine upload as UPLOADED', async () => {
      const { service, repo } = build();
      const result = await service.completeUpload(OWNER, 'media_1');
      expect(result.status).toBe('UPLOADED');
      expect(repo.update).toHaveBeenCalledWith(
        'media_1',
        expect.objectContaining({ status: 'UPLOADED' }),
      );
    });

    it('is idempotent — a second confirm is not an error', async () => {
      const { service, repo } = build();
      repo.findById.mockResolvedValue(media({ status: 'UPLOADED' }));
      const result = await service.completeUpload(OWNER, 'media_1');
      expect(result.status).toBe('UPLOADED');
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('fails when the file was never actually uploaded', async () => {
      const { service, storage, repo } = build();
      storage.head.mockResolvedValue(null);
      await expect(service.completeUpload(OWNER, 'media_1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.update).toHaveBeenCalledWith('media_1', { status: 'FAILED' });
    });

    // The central security test: the client said JPEG, the bytes say
    // executable. It must be rejected and removed from storage.
    it('rejects and deletes a file whose contents contradict its declared type', async () => {
      const { service, storage, repo } = build();
      storage.readHead.mockResolvedValue(EXE_HEAD);

      await expect(service.completeUpload(OWNER, 'media_1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.update).toHaveBeenCalledWith('media_1', { status: 'FAILED' });
      expect(storage.delete).toHaveBeenCalledWith(`users/${OWNER}/abc`);
    });

    it('rejects a file larger than the limit as measured by storage', async () => {
      const { service, storage } = build();
      storage.head.mockResolvedValue({ sizeBytes: 999_000_000 });
      await expect(service.completeUpload(OWNER, 'media_1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(storage.delete).toHaveBeenCalled();
    });

    it('records the size storage reports, not the size the client claimed', async () => {
      const { service, storage, repo } = build();
      storage.head.mockResolvedValue({ sizeBytes: 4321 });
      await service.completeUpload(OWNER, 'media_1');
      expect(repo.update.mock.calls[0][1].sizeBytes).toBe(4321);
    });

    // Only the first few bytes are read. Verifying a 20MB PDF must not pull
    // 20MB through the API that deliberately never touches the upload.
    it('reads only a small head of the object, never the whole file', async () => {
      const { service, storage } = build();
      await service.completeUpload(OWNER, 'media_1');
      const [, byteCount] = storage.readHead.mock.calls[0];
      expect(byteCount).toBeLessThanOrEqual(64);
    });

    it("refuses to complete someone else's upload", async () => {
      const { service, repo } = build();
      repo.findById.mockResolvedValue(media({ ownerUserId: 'someone_else' }));
      await expect(service.completeUpload(OWNER, 'media_1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('404s for an unknown id', async () => {
      const { service, repo } = build();
      repo.findById.mockResolvedValue(null);
      await expect(service.completeUpload(OWNER, 'nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('attachment rules', () => {
    it('allows attaching your own completed file', async () => {
      const { service, repo } = build();
      repo.findById.mockResolvedValue(media({ status: 'UPLOADED' }));
      await expect(service.assertAttachable(OWNER, 'media_1')).resolves.toBeDefined();
    });

    // Without this, a provider could attach a row whose file never arrived
    // and put a permanently broken image on a public listing.
    it('refuses to attach a file that has not finished uploading', async () => {
      const { service } = build();
      await expect(service.assertAttachable(OWNER, 'media_1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    // The attack this exists to stop: user B attaching user A's file.
    it("refuses to attach another user's file", async () => {
      const { service, repo } = build();
      repo.findById.mockResolvedValue(media({ ownerUserId: 'someone_else', status: 'UPLOADED' }));
      await expect(service.assertAttachable(OWNER, 'media_1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('delete', () => {
    it('soft deletes the row and removes the object', async () => {
      const { service, repo, storage } = build();
      await service.remove(OWNER, 'media_1');
      expect(repo.softDelete).toHaveBeenCalledWith('media_1');
      expect(storage.delete).toHaveBeenCalledWith(`users/${OWNER}/abc`);
    });

    it("refuses to delete another user's file", async () => {
      const { service, repo, storage } = build();
      repo.findById.mockResolvedValue(media({ ownerUserId: 'someone_else' }));
      await expect(service.remove(OWNER, 'media_1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.softDelete).not.toHaveBeenCalled();
      expect(storage.delete).not.toHaveBeenCalled();
    });
  });

  describe('abandoned uploads', () => {
    it('sweeps stale PENDING rows from storage as well as the database', async () => {
      const { service, repo, storage } = build();
      repo.findStalePending.mockResolvedValue([media({ id: 'old_1', objectKey: 'users/u/old' })]);

      await service.requestUpload(OWNER, {
        fileName: 'a.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 100,
      });
      // Fire-and-forget, so let the microtask queue drain.
      await new Promise((r) => setTimeout(r, 0));

      expect(storage.delete).toHaveBeenCalledWith('users/u/old');
      expect(repo.update).toHaveBeenCalledWith('old_1', { status: 'FAILED' });
    });

    // Housekeeping must never turn a user's upload request into an error.
    it('still issues an upload URL when the sweep fails', async () => {
      const { service, repo } = build();
      repo.findStalePending.mockRejectedValue(new Error('database unavailable'));

      await expect(
        service.requestUpload(OWNER, {
          fileName: 'a.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 100,
        }),
      ).resolves.toHaveProperty('uploadUrl');
    });
  });
});
