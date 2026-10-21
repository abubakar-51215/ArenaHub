# ADR-009: Why Google sign-in is in scope

**Status:** Accepted · **Date:** 2026-10-22 · **Sprint:** 4

## Context
Doc 06 marked social login (Google/Apple) **optional**, and PROJECT_GUIDELINES.md
deviation #6 — as it originally stood — said both Google **and** Apple were
deferred ("don't build it unless asked"). Despite that, Google sign-in for
players was built during a later working session: `/auth/google` and
`/auth/google/phone`, `backend/app/integrations/google.py`, and the mobile
`app/one-more-step.tsx` + `lib/google-sign-in.ts`. The guideline was not updated
at the time, so the code and deviation #6 drifted apart and there was no ADR
recording the choice. This ADR formalizes that Google sign-in is in scope while
Apple sign-in stays deferred.

## Decision
Google sign-in for players is **accepted scope**. Players can "Continue with
Google" and, on first sign-in, complete a phone step (`/auth/google/phone`). The
feature is **off at runtime until `GOOGLE_CLIENT_IDS` is configured**
(`backend/app/core/config.py`: empty by default = Google sign-in off), so dev
defaults to email/password and the native flow needs a dev build. Apple sign-in
remains deferred per doc 06 and deviation #6 — not built unless asked.

## Consequences
- **Positive:** Lower-friction signup/login for players, matching the common
  consumer-app expectation of a one-tap Google option; no new business rules,
  reusing the existing auth and phone-verification paths.
- **Negative / trade-offs:** Another case where a guideline (deviation #6)
  drifted from the code before being caught. Apple remains unbuilt, so the two
  social platforms are asymmetric (Google only).
- **Mitigation:** This ADR plus the deviation #6 rewrite close the gap — the
  guideline now matches the code and names the files. FEATURE_STATUS.md Conflict
  C2 (Google sign-in) is resolved by this ADR. The feature stays dormant until
  `GOOGLE_CLIENT_IDS` is set, so an unconfigured deployment behaves exactly as
  before.
