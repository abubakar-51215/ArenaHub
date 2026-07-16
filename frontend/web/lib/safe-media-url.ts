import { API_URL } from "@/config";

const ALLOWED_HOSTS = new Set(["res.cloudinary.com"]);

/**
 * Whether a backend-supplied media URL (receipt, avatar, arena image) is
 * safe to render as an `<img src>`/`href` — same-origin relative path, the
 * configured API host (dev's local media server), or the known Cloudinary
 * CDN host (prod). Guards against ever rendering an arbitrary string from a
 * response as a live URL if the backend's own validation were ever bypassed.
 */
export function isSafeMediaUrl(url: string): boolean {
  if (url.startsWith("/")) return true;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    if (ALLOWED_HOSTS.has(parsed.hostname)) return true;
    if (API_URL) {
      const apiHost = new URL(API_URL).hostname;
      if (parsed.hostname === apiHost) return true;
    }
    return false;
  } catch {
    return false;
  }
}
