/**
 * Server/edge Sentry init (Next.js calls register() at startup). Off unless a
 * DSN is set — an empty DSN means no init and no network call.
 */
import * as Sentry from "@sentry/nextjs";

import { scrubEvent } from "@/lib/sentry-scrub";

export async function register() {
  const dsn = (process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN)?.trim();
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  });
}

export const onRequestError = Sentry.captureRequestError;
