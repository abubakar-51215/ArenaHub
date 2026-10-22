/**
 * Multipart image upload, separate from services/api.ts's JSON request
 * helper: it needs a FormData body and a progress callback as the file goes
 * out, neither of which fetch exposes — so this uses XMLHttpRequest instead,
 * mirroring frontend/mobile/services/uploads.ts's already-proven shape.
 */
import { API_BASE } from "@/config";
import { ApiError, tryRefresh, type FieldError } from "@/services/api";
import { useAuthStore } from "@/store/auth";

/** The server's own limits (shared/storage.py): JPEG, PNG or WebP, up to 5 MB. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const UPLOAD_TIMEOUT_MS = 60000;

/** A plain-English reason a picked file cannot be sent, or null when it is fine.
 * Mirrors the backend's own wording so the message never disagrees with the
 * server's — the server re-checks everything regardless. */
export function fileProblem(file: File): string | null {
  if (file.size === 0) return "Choose a photo (JPG, PNG, or WebP, up to 5 MB).";
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return "Unsupported image type. Use JPEG, PNG, or WebP.";
  }
  if (file.size > MAX_UPLOAD_BYTES) return "Image is too large (max 5 MB).";
  return null;
}

/** The person (or the app) stopped the upload. Not an error to show. */
export class UploadAbortedError extends Error {
  constructor() {
    super("Upload stopped.");
    this.name = "UploadAbortedError";
  }
}

/** The connection failed or timed out before the server answered. */
export class UploadNetworkError extends Error {
  constructor(message = "Upload failed. Check your connection.") {
    super(message);
    this.name = "UploadNetworkError";
  }
}

export interface UploadOptions {
  signal?: AbortSignal;
  /** 0 to 100, as the file goes out. */
  onProgress?: (percent: number) => void;
}

function attempt(
  file: File,
  folder: string,
  token: string | null,
  opts: UploadOptions,
): Promise<{ url: string } | { retry: true }> {
  const form = new FormData();
  form.append("file", file);
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new UploadAbortedError());
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/uploads/image?folder=${folder}`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        opts.onProgress?.(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      }
    };
    xhr.onerror = () => reject(new UploadNetworkError());
    xhr.ontimeout = () =>
      reject(
        new UploadNetworkError("The upload took too long. Check your connection and try again."),
      );
    xhr.onabort = () => reject(new UploadAbortedError());
    xhr.onload = () => {
      if (xhr.status === 401 && token) return resolve({ retry: true });
      let env: {
        success?: boolean;
        message?: string;
        data?: { url?: string };
        errors?: FieldError[] | null;
      };
      try {
        env = JSON.parse(xhr.responseText);
      } catch {
        return reject(new ApiError(xhr.statusText || "Upload failed", xhr.status));
      }
      if (xhr.status < 200 || xhr.status >= 300 || !env.success || !env.data?.url) {
        return reject(new ApiError(env.message || "Upload failed", xhr.status, env.errors ?? []));
      }
      opts.onProgress?.(100);
      resolve({ url: env.data.url });
    };
    opts.signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(form);
  });
}

/** Upload an image to ArenaHub's own server (never Cloudinary directly — no
 * secret ever reaches the browser) and return its stored URL. */
export async function uploadImage(
  file: File,
  folder: "arenas" | "courts" | "avatars" | "receipts" = "arenas",
  opts: UploadOptions = {},
): Promise<string> {
  const token = useAuthStore.getState().accessToken;
  const first = await attempt(file, folder, token, opts);
  if ("url" in first) return first.url;
  const fresh = await tryRefresh();
  const second = await attempt(file, folder, fresh, opts);
  if ("url" in second) return second.url;
  throw new ApiError("Session expired. Please sign in again.", 401);
}
