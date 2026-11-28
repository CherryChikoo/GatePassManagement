/**
 * AbortSignal.timeout for every browser: older tablets (Chrome before 103, Safari before 16)
 * don't have it, and calling it there broke every request ("No internet connection").
 */
export function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== "undefined" && typeof (AbortSignal as { timeout?: unknown }).timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const c = new AbortController();
  setTimeout(() => {
    try {
      c.abort(new DOMException("The operation timed out.", "TimeoutError"));
    } catch {
      c.abort();
    }
  }, ms);
  return c.signal;
}
