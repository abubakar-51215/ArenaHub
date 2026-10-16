// A short line for each step the app waits for while it starts, in development only (read it in the Metro terminal).
const t0 = Date.now();

export function startupLog(step: string): void {
  if (__DEV__) console.log(`[startup +${String(Date.now() - t0).padStart(5, ' ')} ms] ${step}`);
}
