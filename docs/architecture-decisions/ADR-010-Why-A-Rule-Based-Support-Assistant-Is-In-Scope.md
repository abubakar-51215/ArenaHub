# ADR-010: Why a rule-based support assistant is in scope

**Status:** Accepted · **Date:** 2026-10-22 · **Sprint:** 4

## Context
PROJECT_GUIDELINES.md deviation #3 — as it originally stood — said the AI module
is NLP search + recommendations only, with "no separate FAQ knowledge-base bot."
Read literally, that could be taken to rule out any separate support bot. A
support assistant was nonetheless built: `backend/app/modules/assistant/`,
`/assistant/ask`, and the mobile `app/support/assistant.tsx` +
`app/support/faq.tsx` (documented in `docs/ASSISTANT_ANSWERS.md`). It is **not**
the thing the exclusion was aimed at: it makes no external calls, runs no
ML/deep-learning model, and does no open-ended retrieval — it matches a question
to one intent by keyword scoring and answers with fixed, pre-written sentences
filled in with the player's own booking/payment/refund data. That is defensibly
outside the letter of "no FAQ knowledge-base bot," but it is still a separate
support assistant, so it needed an explicit scope confirmation.

## Decision
The rule-based support assistant is **accepted scope**, with an explicit
boundary: it only fills **fixed templates with the user's own data**. It never
does open-ended retrieval, never generates novel text, and never calls an
external ML service. Smart search (rule-based language understanding over the
existing NLP query interface) was already allowed by deviation #3 and is
confirmed in scope. The "no external ML / no deep learning / no general FAQ
knowledge-base retrieval bot" boundary stays intact.

## Consequences
- **Positive:** Answers the most common player questions from their own data,
  reducing support load without the maintenance burden of a real knowledge base
  or an LLM system; fully deterministic and auditable (it can only emit the
  pre-written sentences in `docs/ASSISTANT_ANSWERS.md`).
- **Negative / trade-offs:** Another drift-then-catch-up case — the same pattern
  as Google sign-in (ADR-009) — where the build ran ahead of the guideline.
- **Mitigation:** This ADR plus the deviation #3 rewrite close the gap and pin
  the boundary (fixed templates + the user's own data only). FEATURE_STATUS.md
  Conflict C3 (support assistant) is resolved by this ADR.
