/**
 * Multipart image upload, separate from lib/api.ts's JSON request helper: it needs a FormData body, no Content-Type override
 * (the multipart boundary is set by the request itself), progress while it goes, and a way to stop it. It uses XMLHttpRequest
 * for exactly those two things (fetch has neither upload progress nor a progress callback).
 */
import { Platform } from 'react-native';

import { ApiError, type FieldError } from '../lib/api';
import { API_BASE } from '../lib/config';
import { useAuthStore } from '../store/auth';

/** A photo may be up to 5 MB (the server's limit) and must be a JPG or PNG (WebP is also accepted). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 60000;

export interface PhotoProblem {
  title: string;
  text: string;
}

/** A plain-English reason a picked photo cannot be sent (the two lines of the "Photo too big" state), or null when it is fine. */
export function photoProblem(
  asset: { fileSize?: number | null; mimeType?: string | null },
  what: 'receipt' | 'photo' = 'photo',
): PhotoProblem | null {
  // an empty file (0 bytes) is treated as "nothing chosen": nothing is sent
  if (asset.fileSize === 0) {
    return {
      title: what === 'receipt' ? 'Choose a photo of your receipt (JPG or PNG, up to 5 MB).' : 'Choose a photo (JPG or PNG, up to 5 MB).',
      text: 'That file is empty.',
    };
  }
  if (asset.mimeType && !/^image\/(jpe?g|png|webp)$/i.test(asset.mimeType)) {
    return { title: 'That file is not a photo we can use.', text: 'Use a JPG or PNG up to 5 MB.' };
  }
  if (asset.fileSize && asset.fileSize > MAX_UPLOAD_BYTES) {
    return { title: 'That photo is too big.', text: 'Use a JPG or PNG up to 5 MB.' };
  }
  return null;
}

/** The person (or the app) stopped the upload. Not an error to show. */
export class UploadAbortedError extends Error {
  constructor() {
    super('Upload stopped.');
    this.name = 'UploadAbortedError';
  }
}

/** The connection failed or timed out before the server answered: "Upload failed. Check your connection." */
export class UploadNetworkError extends Error {
  constructor(message = 'Upload failed. Check your connection.') {
    super(message);
    this.name = 'UploadNetworkError';
  }
}

export interface UploadOptions {
  signal?: AbortSignal;
  /** 0 to 100, as the file goes out. */
  onProgress?: (percent: number) => void;
}

export async function uploadImage(uri: string, folder: 'receipts' | 'avatars' = 'receipts', opts: UploadOptions = {}): Promise<string> {
  const token = useAuthStore.getState().accessToken;
  const form = new FormData();
  const filename = uri.split('/').pop() || 'photo.jpg';
  const ext = filename.split('.').pop()?.toLowerCase();
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  if (Platform.OS === 'web') {
    // a browser FormData needs the real file, not the file-like shape
    const blob = await (await fetch(uri)).blob();
    form.append('file', blob, filename);
  } else {
    // React Native's FormData accepts this file-like shape.
    form.append('file', { uri, name: filename, type: mime } as unknown as Blob);
  }

  return new Promise<string>((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new UploadAbortedError());
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/uploads/image?folder=${folder}`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.timeout = UPLOAD_TIMEOUT_MS; // a slow or dead connection must not leave the person waiting for ever
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) opts.onProgress?.(Math.min(100, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onerror = () => reject(new UploadNetworkError());
    xhr.ontimeout = () => reject(new UploadNetworkError('The upload took too long. Check your connection and try again.'));
    xhr.onabort = () => reject(new UploadAbortedError());
    xhr.onload = () => {
      // A non-JSON body (5xx HTML error page, proxy timeout) must not throw an uncaught SyntaxError.
      let env: { success?: boolean; message?: string; data?: { url?: string }; errors?: FieldError[] | null };
      try {
        env = JSON.parse(xhr.responseText);
      } catch {
        return reject(new ApiError(xhr.statusText || 'Upload failed', xhr.status));
      }
      if (xhr.status < 200 || xhr.status >= 300 || !env.success || !env.data?.url) {
        return reject(new ApiError(env.message || 'Upload failed', xhr.status, env.errors ?? []));
      }
      opts.onProgress?.(100);
      resolve(env.data.url);
    };
    opts.signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(form);
  });
}
