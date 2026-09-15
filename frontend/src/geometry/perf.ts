/**
 * Minimal, framework-free timing instrumentation (Phase 9: "performance
 * instrumentation"). Wraps a synchronous calculation and reports how long
 * it took, so the cost of an expensive geometry pass (TIN triangulation,
 * section-plane intersection) is a visible, surfaced number rather than an
 * invisible property of the implementation -- callers decide what to do
 * with the duration (log it, store it, display it); this module has no
 * opinion on where the number goes.
 */

export interface TimedResult<T> {
  readonly result: T;
  readonly durationMs: number;
}

export function measureSync<T>(fn: () => T): TimedResult<T> {
  const start = performance.now();
  const result = fn();
  return { result, durationMs: performance.now() - start };
}
