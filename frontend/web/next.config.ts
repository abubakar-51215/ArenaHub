import type { NextConfig } from "next";

// Sprint 5 security checklist: XSS protection via CSP + standard security
// headers. connect-src/img-src must allow the FastAPI backend (API calls and
// locally-served /uploads images) and the OSM tile host for maps.
// 'unsafe-inline'/'unsafe-eval' in script-src: Next.js injects inline runtime
// scripts (and dev mode needs eval for fast refresh) — a nonce-based policy is
// the production-hardening follow-up, tracked for the deployment phase.
const API_ORIGIN = new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").origin;
const API_WS_ORIGIN = API_ORIGIN.replace(/^http/, "ws");

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${API_ORIGIN} https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://res.cloudinary.com`,
  `connect-src 'self' ${API_ORIGIN} ${API_WS_ORIGIN}`,
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
