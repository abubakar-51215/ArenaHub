/**
 * Strip personal data from a Sentry event before it is sent (mirrors the
 * backend's app/core/observability.py and the web app's lib/sentry-scrub.ts).
 * Request body/headers/cookies/query are dropped; the user is reduced to an
 * anonymous id; emails, phone numbers, tokens and receipt links are redacted
 * anywhere they appear. Proven by the backend's test_sentry_scrub.py.
 */
import type { ErrorEvent } from "@sentry/react-native";

const REDACTED = "[redacted]";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?:\+?92|0)\d{9,10}\b/g;
const TOKEN = /(?:[Bb]earer\s+[A-Za-z0-9._-]+|eyJ[A-Za-z0-9._-]{8,})/g;
const RECEIPT = /\/(?:api\/v1\/media|uploads)\/receipts\/[^\s"'<>]*/g;
// Sentry auto-captures breadcrumbs for the app's own fetch/XHR calls, including the full URL as
// free text — this catches a near-me search's lat/lon/radius there (request.query_string is
// dropped wholesale below, but breadcrumbs are a separate code path).
const LOCATION_QUERY_PARAM = /\b(lat|lon|latitude|longitude|radius_km|amenity_ids|amenities|time_of_day)=[^&\s"'<>]*/gi;
const SECRET_KEY = /password|token|secret|authorization|cookie|api[_-]?key|otp|code|session/i;

export function redactText(text: string): string {
  return text
    .replace(EMAIL, REDACTED)
    .replace(PHONE, REDACTED)
    .replace(TOKEN, REDACTED)
    .replace(RECEIPT, REDACTED)
    .replace(LOCATION_QUERY_PARAM, "$1=[redacted]");
}

function scrub(value: unknown, key?: string): unknown {
  if (key && SECRET_KEY.test(key)) return REDACTED;
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map((v) => scrub(v));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = scrub(v, k);
    return out;
  }
  return value;
}

export function scrubEvent(event: ErrorEvent): ErrorEvent | null {
  if (event.request) {
    delete event.request.data;
    delete event.request.headers;
    delete event.request.cookies;
    delete event.request.query_string;
  }
  if (event.user) {
    event.user = event.user.id ? { id: String(event.user.id) } : {};
  }
  for (const section of ["message", "breadcrumbs", "extra", "contexts", "tags"] as const) {
    if (event[section] !== undefined) {
      // @ts-expect-error - sections hold heterogeneous shapes; scrub preserves them
      event[section] = scrub(event[section]);
    }
  }
  return event;
}
