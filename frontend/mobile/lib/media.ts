import { API_URL } from '@/lib/config';

// Any URI with its own scheme (https:, http:, file:, content:, blob:,
// data:, asset:, ph: and so on — RFC 3986's scheme grammar, not just the
// two cases this app happens to use today) must be left alone: a freshly
// picked local image (app/profile/edit.tsx) can be file://, blob: (web) or
// ph:// (iOS photo library), none of which are relative upload paths.
// Protocol-relative URLs (//host/path) carry their own host too.
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const PROTOCOL_RELATIVE = /^\/\//;

/**
 * Resolves a photo field (arena images, profile_picture) to a usable URL.
 * The backend returns some photos as absolute URLs and some as relative
 * upload paths (e.g. `/uploads/misc/<id>.png`) — a relative path needs the
 * API's own origin prefixed, or it resolves against whatever page is
 * currently loaded (the Expo web dev server, not the backend) and 404s.
 * This is the actual cause of the avatar 404 seen in the capture harness.
 */
export function resolveMediaUrl(photo?: string | null): string | undefined {
  if (!photo) return undefined;
  if (HAS_SCHEME.test(photo) || PROTOCOL_RELATIVE.test(photo)) return photo;
  return photo.startsWith('/') ? `${API_URL}${photo}` : `${API_URL}/${photo}`;
}
