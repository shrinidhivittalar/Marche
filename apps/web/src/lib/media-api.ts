import { ApiError } from './api';

// The three-step upload, as one call for the caller.
//
// The middle step is the point of the whole design: the browser PUTs the
// file straight to storage using a short-lived signed URL, so a large file
// never travels through the API.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export interface UploadedImage {
  mediaId: string;
  fileName: string;
  /** Signed and short-lived; absent until the server returns one. */
  url?: string;
}

interface UploadAuthorization {
  mediaId: string;
  uploadUrl: string;
  expiresIn: number;
}

async function json<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const raw = body?.message ?? `Request failed with status ${res.status}`;
    throw new ApiError(res.status, Array.isArray(raw) ? raw.join(', ') : raw);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const mediaApi = {
  /**
   * Authorise, upload, confirm. Resolves only once the server has verified
   * the file actually arrived and matches its declared type — so anything
   * this returns is safe to attach.
   */
  async upload(token: string, file: File): Promise<UploadedImage> {
    const auth = await json<UploadAuthorization>('/media/upload-url', token, {
      method: 'POST',
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      }),
    });

    // Straight to storage. No Authorization header — the signature in the
    // URL is the credential, and sending a bearer token to a third-party
    // host would leak it.
    const put = await fetch(auth.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type },
    });

    if (!put.ok) {
      throw new ApiError(put.status, 'The file could not be uploaded to storage.');
    }

    // Until this succeeds the file is a PENDING row that nothing can use.
    await json(`/media/${auth.mediaId}/complete`, token, { method: 'POST' });

    return { mediaId: auth.mediaId, fileName: file.name };
  },

  remove(token: string, mediaId: string) {
    return json<void>(`/media/${mediaId}`, token, { method: 'DELETE' });
  },
};
