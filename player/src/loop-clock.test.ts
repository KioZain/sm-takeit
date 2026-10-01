import { describe, expect, it } from "vitest";

import { advanceLoopProgress, clampLoopSeconds, wrapProgress } from "./loop-clock";

describe("player loop clock", () => {
  it("turns elapsed time into progress at the asked pace", () => {
    expect(advanceLoopProgress(0, 1000, 4)).toBeCloseTo(0.25);
    expect(advanceLoopProgress(0, 1000, 2)).toBeCloseTo(0.5);
    // Twice the cycle length is half the travel in the same wall-clock second.
    expect(advanceLoopProgress(0, 1000, 8)).toBeCloseTo(0.125);
  });

  it("comes back to where it started after a whole cycle", () => {
    const steps = 60;
    const progress = Array.from({ length: steps }).reduce<number>(
      (current) => advanceLoopProgress(current, 4000 / steps, 4),
      0,
    );
    expect(wrapProgress(progress)).toBeCloseTo(0, 6);
  });

  it("absorbs a late frame instead of lurching the wave forward", () => {
    // A tab that was away for ten seconds must not skip two and a half cycles.
    expect(advanceLoopProgress(0.3, 10_000, 4)).toBeCloseTo(0.3);
    expect(advanceLoopProgress(0.3, 4000, 4)).toBeCloseTo(0.3);
    expect(advanceLoopProgress(0.3, 2000, 4)).toBeCloseTo(0.8);
  });

  it("keeps progress inside one cycle whatever it is given", () => {
    expect(wrapProgress(1)).toBe(0);
    expect(wrapProgress(2.25)).toBeCloseTo(0.25);
    expect(wrapProgress(-0.25)).toBeCloseTo(0.75);
    expect(wrapProgress(Number.NaN)).toBe(0);
    expect(advanceLoopProgress(0.5, Number.NaN, 4)).toBeCloseTo(0.5);
    expect(advanceLoopProgress(0.5, -100, 4)).toBeCloseTo(0.5);
  });

  it("holds the speed inside the range the generator offers", () => {
    expect(clampLoopSeconds(0.1)).toBe(1);
    expect(clampLoopSeconds(99)).toBe(12);
    expect(clampLoopSeconds(Number.NaN)).toBe(1);
    expect(clampLoopSeconds(6.5)).toBe(6.5);
  });
});
