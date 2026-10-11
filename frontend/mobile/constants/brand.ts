// The splash plays the logo's 7.2 s hero timeline (design/brand/arenahub-logo.html).
/** First launch after install: the full timeline, 7.2 s. */
export const SPLASH_SPEED_FIRST_LAUNCH = 1;
/** Every later cold start: change this one number to make the splash faster or slower (2 = about 3.6 s). */
export const SPLASH_SPEED_LATER_LAUNCHES = 2;
/** The wordmark and tagline are fully in at this share of the timeline; the app moves on after it. */
export const SPLASH_SETTLED_AT = 0.82;
/** Fade of the splash into the app. */
export const SPLASH_FADE_MS = 250;
/** After Log in, the full-screen loader shows only if sign-in takes longer than this. */
export const LOGIN_LOADER_AFTER_MS = 500;

// ---- start-up safety (the app must never sit on the splash)
/** Every network call made while starting up gives up after this long. */
export const STARTUP_CALL_TIMEOUT_MS = 8000;
/** Whatever is still not ready after this long, the splash ends and the app goes on to Log in. */
export const SPLASH_MAX_MS = 12000;
/** Fonts that are not loaded after this long are replaced by the system fonts. */
export const FONTS_MAX_MS = 4000;
