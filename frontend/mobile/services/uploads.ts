/**
 * Multipart image upload — separate from lib/api.ts's JSON request helper
 * since this needs a FormData body and no Content-Type override (fetch sets
 * the multipart boundary itself).
 */
import { ApiError, type FieldError } from '../lib/api';
import { API_BASE } from '../lib/config';
import { useAuthStore } from '../store/auth';

export async function uploadImage(
  uri: string,
  folder: 'receipts' | 'avatars' = 'receipts',
): Promise<string> {
  const token = useAuthStore.getState().accessToken;
  const form = new FormData();
  const filename = uri.split('/').pop() || 'photo.jpg';
  const ext = filename.split('.').pop()?.toLowerCase();
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  // React Native's fetch accepts this file-like shape for FormData.
  form.append('file', { uri, name: filename, type: mime } as unknown as Blob);

  const res = await fetch(`${API_BASE}/uploads/image?folder=${folder}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
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
