/**
 * Multipart image upload — separate from lib/api.ts's JSON request helper
 * since this needs a FormData body and no Content-Type override (fetch sets
 * the multipart boundary itself).
 */
import { Platform } from 'react-native';

import { ApiError, type FieldError } from '../lib/api';
import { API_BASE } from '../lib/config';
import { useAuthStore } from '../store/auth';

/** A photo may be up to 5 MB (the server's limit) and must be a JPG, PNG or WebP. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 60000;

/** A plain-English reason a picked photo cannot be sent, or null when it is fine. */
export function photoProblem(asset: { fileSize?: number | null; mimeType?: string | null }): string | null {
  if (asset.mimeType && !/^image\/(jpe?g|png|webp)$/i.test(asset.mimeType)) return 'Please choose a JPG or PNG photo.';
  if (asset.fileSize && asset.fileSize > MAX_UPLOAD_BYTES) return 'This photo is too big. Please choose one under 5 MB.';
  return null;
}

export async function uploadImage(
  uri: string,
  folder: 'receipts' | 'avatars' = 'receipts',
  signal?: AbortSignal,
): Promise<string> {
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
    // React Native's fetch accepts this file-like shape for FormData.
    form.append('file', { uri, name: filename, type: mime } as unknown as Blob);
  }

  // a slow or dead connection must not leave the person waiting for ever
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  signal?.addEventListener('abort', () => controller.abort());
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/uploads/image?folder=${folder}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) throw new ApiError('The upload took too long. Check your connection and try again.', 0);
    throw err;
  } finally {
    clearTimeout(timer);
  }
  // A non-JSON body (5xx HTML error page, proxy timeout) must not throw an
  // uncaught SyntaxError out of this function.
  let env: {
    success?: boolean;
    message?: string;
    data?: { url?: string };
    errors?: FieldError[] | null;
  };
  try {
    env = await res.json();
  } catch {
    throw new ApiError(res.statusText || 'Upload failed', res.status);
  }
  if (!res.ok || !env.success || !env.data?.url) {
    throw new ApiError(env.message || 'Upload failed', res.status, env.errors ?? []);
  }
  return env.data.url;
}
