import { describe, expect, it } from "vitest";
import { measureSync } from "./perf";

describe("measureSync", () => {
  it("returns the wrapped function's own result unchanged", () => {
    const { result } = measureSync(() => 21 * 2);
    expect(result).toBe(42);
  });

  it("reports a non-negative duration", () => {
    const { durationMs } = measureSync(() => {
      let total = 0;
      for (let i = 0; i < 1000; i += 1) total += i;
      return total;
    });
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });

  it("propagates an exception thrown by the wrapped function rather than swallowing it", () => {
    expect(() =>
      measureSync(() => {
        throw new Error("boom");
      })
    ).toThrow("boom");
  });
});
