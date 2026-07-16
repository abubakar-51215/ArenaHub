import type { NextConfig } from "next";

// Sprint 5 security checklist: XSS protection via CSP + standard security
// headers. connect-src/img-src must allow the FastAPI backend (API calls and
// locally-served /uploads images) and the OSM tile host for maps.
// 'unsafe-inline'/'unsafe-eval' in script-src: Next.js injects inline runtime
// scripts (and dev mode needs eval for fast refresh) — a nonce-based policy is
// the production-hardening follow-up, tracked for the deployment phase.
const rawApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
const API_ORIGIN = rawApiUrl && /^https?:\/\//i.test(rawApiUrl) ? new URL(rawApiUrl).origin : null;
const API_WS_ORIGIN = API_ORIGIN ? API_ORIGIN.replace(/^http/, "ws") : null;

const IMG_SRC = ["'self'", "data:", "blob:"];
if (API_ORIGIN) IMG_SRC.push(API_ORIGIN);
IMG_SRC.push("https://tile.openstreetmap.org", "https://*.tile.openstreetmap.org");
IMG_SRC.push("https://res.cloudinary.com", "https://images.unsplash.com");

const CONNECT_SRC = ["'self'"];
if (API_ORIGIN) CONNECT_SRC.push(API_ORIGIN);
if (API_WS_ORIGIN) CONNECT_SRC.push(API_WS_ORIGIN);

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  `img-src ${IMG_SRC.join(" ")}`,
  `connect-src ${CONNECT_SRC.join(" ")}`,
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
