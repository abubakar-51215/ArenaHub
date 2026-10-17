/**
 * Mobile error tracking (Sentry). Off unless EXPO_PUBLIC_SENTRY_DSN is set.
 *
 * The SDK is loaded with a dynamic import that only runs when a DSN is present,
 * so Expo Go, the static web export, and any build without a DSN never load the
 * native module — no crash, no network call. Native crash reporting needs a
 * development/production build (see docs/DEV_BUILD_AND_GOOGLE_PUSH.md).
 */
import { scrubEvent } from "./sentry-scrub";

export async function initSentry(): Promise<void> {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn) return;
  try {
    const Sentry = await import("@sentry/react-native");
    Sentry.init({
      dsn,
      tracesSampleRate: 0,
      beforeSend: scrubEvent,
    });
  } catch (err) {
    // Expo Go has no native module: fail safely, never crash the app.
    if (__DEV__) console.warn("Sentry not available in this runtime:", err);
  }
}
