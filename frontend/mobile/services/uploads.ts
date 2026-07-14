/**
 * Multipart image upload — separate from lib/api.ts's JSON request helper
 * since this needs a FormData body and no Content-Type override (fetch sets
 * the multipart boundary itself).
 */
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
  const env = await res.json();
  if (!res.ok || !env.success) {
    throw new Error(env.message || 'Upload failed');
  }
  return env.data.url as string;
}
