// Upload limits and allowed types, read from the environment rather than
// scattered as literals. These are the numbers most likely to need changing
// without a code review — "PDFs can be 50MB now" should be a config change,
// not a pull request.

const mb = (n: number) => n * 1024 * 1024;

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const DOCUMENT_MIME_TYPES = ['application/pdf'] as const;

export const ALLOWED_MIME_TYPES: readonly string[] = [...IMAGE_MIME_TYPES, ...DOCUMENT_MIME_TYPES];

// Deliberately narrow. Archives and anything executable are excluded: they
// are the formats that turn a file store into a malware host, and nothing
// in Phase 1 needs them.
function isImage(mimeType: string): boolean {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
}

export const mediaConfig = {
  maxImageBytes: Number(process.env.MEDIA_MAX_IMAGE_SIZE ?? mb(10)),
  maxDocumentBytes: Number(process.env.MEDIA_MAX_DOCUMENT_SIZE ?? mb(20)),

  // Short enough that a leaked URL is worthless quickly, long enough for a
  // large file on a poor connection. Applies to upload URLs only.
  uploadUrlTtlSeconds: Number(process.env.MEDIA_UPLOAD_URL_TTL ?? 300),

  // Longer than an upload URL because a browser may hold a page open, but
  // still short: a leaked image link should stop working quickly. Long
  // enough that a listing page does not expire while being read.
  downloadUrlTtlSeconds: Number(process.env.MEDIA_DOWNLOAD_URL_TTL ?? 3600),

  // A PENDING row older than this is an abandoned upload — the browser
  // asked for a URL and never finished. Swept lazily; see MediaService.
  orphanAgeMinutes: Number(process.env.MEDIA_ORPHAN_AGE_MINUTES ?? 60),

  maxFileNameLength: 255,
};

export function maxBytesFor(mimeType: string): number {
  return isImage(mimeType) ? mediaConfig.maxImageBytes : mediaConfig.maxDocumentBytes;
}

// Magic-byte signatures, checked against the first bytes of the stored
// object after upload. The mimeType a client declares is a claim, not
// evidence — a .exe renamed to .jpg passes every header check ever written.
const SIGNATURES: { mimeType: string; bytes: number[]; offset?: number }[] = [
  { mimeType: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mimeType: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // WEBP is "RIFF" then four size bytes then "WEBP", so the marker at
  // offset 8 is what actually identifies it.
  { mimeType: 'image/webp', bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 },
  { mimeType: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
];

/**
 * True when the bytes look like the type they claim to be. Only the first
 * few bytes are needed, which is why the caller fetches a Range rather than
 * the whole object — verifying a 20MB PDF should not mean moving 20MB
 * through the API that deliberately never touches the upload itself.
 */
export function matchesSignature(mimeType: string, head: Uint8Array): boolean {
  const signature = SIGNATURES.find((s) => s.mimeType === mimeType);
  // An allowed type with no signature entry would silently pass; treat it
  // as a failure so adding a type without a signature is caught here.
  if (!signature) return false;

  const offset = signature.offset ?? 0;
  if (head.length < offset + signature.bytes.length) return false;

  return signature.bytes.every((byte, i) => head[offset + i] === byte);
}

/** Bytes needed to identify any supported type. */
export const SIGNATURE_HEAD_BYTES = 16;
