"use client";

/** The code step outlives a refresh: the email and the masked address only (never the password), for 10 minutes.
 *  `at` is when the code went out, so the 60 s wait goes on from where it was. Sign-in uses it too (an account
 *  whose email is not confirmed yet). */
export const SAVED_STEP = "ah-signup-code";
export type SavedStep = { email: string; sentTo: string; codeSent: boolean; at: number };

export function readSavedStep(): SavedStep | null {
  try {
    const saved = JSON.parse(
      window.sessionStorage.getItem(SAVED_STEP) ?? "null",
    ) as SavedStep | null;
    return saved && Date.now() - saved.at < 10 * 60 * 1000 ? saved : null;
  } catch {
    return null;
  }
}
export function saveStep(step: SavedStep | null) {
  try {
    if (step) window.sessionStorage.setItem(SAVED_STEP, JSON.stringify(step));
    else window.sessionStorage.removeItem(SAVED_STEP);
  } catch {
    // private mode: the step just does not survive a refresh
  }
}
