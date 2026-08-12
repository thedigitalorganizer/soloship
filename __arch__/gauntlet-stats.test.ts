// Gauntlet scoring math — regression tests with hand-computed expectations.
//
// These guard the numbers a whole bake-off is read from. A silent arithmetic
// change here would not fail any command; it would just produce a confidently
// wrong ranking, which is the worst failure mode this tool has.

import { describe, it, expect } from "vitest";
import {
  bootstrapMeanCI,
  bradleyTerry,
  correlation,
  harnessDelta,
  makeRng,
  mean,
  median,
  normalize,
  normalizeInverse,
  stdev,
  summarizeCell,
  tallyPairwise,
  MIN_REPS_FOR_SEPARATION,
} from "../src/gauntlet/stats";

describe("descriptive statistics", () => {
  it("computes mean and median", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([3, 1, 2])).toBe(2);
  });

  it("reports no spread for a single observation rather than inventing one", () => {
    expect(stdev([0.7])).toBe(0);
    expect(stdev([])).toBe(0);
  });

  it("computes sample standard deviation", () => {
    // Sample sd of [2,4,4,4,5,5,7,9] is 2.13809... (n-1 denominator).
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.1381, 3);
  });

  it("handles empty input without NaN", () => {
    expect(mean([])).toBe(0);
    expect(median([])).toBe(0);
  });
});

describe("deterministic RNG", () => {
  it("reproduces the same sequence for the same seed", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const first = [a(), a(), a()];
    const second = [b(), b(), b()];
    expect(first).toEqual(second);
  });

  it("produces values in [0,1)", () => {
    const rng = makeRng(7);
    for (let i = 0; i < 100; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("bootstrap confidence intervals", () => {
  it("collapses to a point for a single observation", () => {
    expect(bootstrapMeanCI([0.8])).toEqual({ low: 0.8, high: 0.8 });
  });

  it("returns a zero interval for no observations", () => {
    expect(bootstrapMeanCI([])).toEqual({ low: 0, high: 0 });
  });

  it("brackets the sample mean", () => {
    const values = [0.2, 0.5, 0.9, 0.4, 0.6];
    const ci = bootstrapMeanCI(values);
    const m = mean(values);
    expect(ci.low).toBeLessThanOrEqual(m);
    expect(ci.high).toBeGreaterThanOrEqual(m);
  });

  it("gives an identical interval on identical values", () => {
    expect(bootstrapMeanCI([0.5, 0.5, 0.5])).toEqual({ low: 0.5, high: 0.5 });
  });

  it("is reproducible across calls with the same seed", () => {
    const values = [0.1, 0.7, 0.3, 0.9];
    expect(bootstrapMeanCI(values, { seed: 99 })).toEqual(
      bootstrapMeanCI(values, { seed: 99 })
    );
  });
});

describe("pairwise tallying", () => {
  it("splits a tie half a win each way", () => {
    const tally = tallyPairwise([{ left: "A", right: "B", winner: null }]);
    expect(tally.wins.get("A")?.get("B")).toBe(0.5);
    expect(tally.wins.get("B")?.get("A")).toBe(0.5);
  });

  it("records a decisive win in one direction only", () => {
    const tally = tallyPairwise([{ left: "A", right: "B", winner: "A" }]);
    expect(tally.wins.get("A")?.get("B")).toBe(1);
    expect(tally.wins.get("B")?.get("A")).toBeUndefined();
  });

  it("collects every competitor that appeared", () => {
    const tally = tallyPairwise([
      { left: "A", right: "B", winner: "A" },
      { left: "C", right: "B", winner: "C" },
    ]);
    expect(tally.competitors).toEqual(["A", "B", "C"]);
  });
});

describe("Bradley-Terry", () => {
  it("ranks a clear ordering correctly", () => {
    // A beats everyone, B beats C, C loses to everyone.
    const strengths = bradleyTerry(
      tallyPairwise([
        { left: "A", right: "B", winner: "A" },
        { left: "B", right: "A", winner: "A" },
        { left: "A", right: "C", winner: "A" },
        { left: "C", right: "A", winner: "A" },
        { left: "B", right: "C", winner: "B" },
        { left: "C", right: "B", winner: "B" },
      ])
    );
    expect(strengths.get("A")!).toBeGreaterThan(strengths.get("B")!);
    expect(strengths.get("B")!).toBeGreaterThan(strengths.get("C")!);
  });

  it("normalizes strengths to sum to one", () => {
    const strengths = bradleyTerry(
      tallyPairwise([
        { left: "A", right: "B", winner: "A" },
        { left: "B", right: "A", winner: "B" },
      ])
    );
    const total = [...strengths.values()].reduce((sum, v) => sum + v, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("gives equal strength to an all-tied field", () => {
    const strengths = bradleyTerry(
      tallyPairwise([
        { left: "A", right: "B", winner: null },
        { left: "B", right: "A", winner: null },
      ])
    );
    expect(strengths.get("A")!).toBeCloseTo(strengths.get("B")!, 6);
  });

  it("stays finite for an undefeated competitor", () => {
    // Without the symmetric prior this diverges to infinity.
    const strengths = bradleyTerry(
      tallyPairwise([
        { left: "A", right: "B", winner: "A" },
        { left: "B", right: "A", winner: "A" },
      ])
    );
    expect(Number.isFinite(strengths.get("A")!)).toBe(true);
    expect(strengths.get("A")!).toBeGreaterThan(strengths.get("B")!);
  });

  it("handles a single competitor without dividing by zero", () => {
    const strengths = bradleyTerry(tallyPairwise([]));
    expect(strengths.size).toBe(0);
  });
});

describe("normalization", () => {
  it("maps min to 0 and max to 1", () => {
    const result = normalize(new Map([["a", 10], ["b", 20], ["c", 30]]));
    expect(result.get("a")).toBe(0);
    expect(result.get("c")).toBe(1);
    expect(result.get("b")).toBe(0.5);
  });

  it("does not penalize anyone when every value ties", () => {
    const result = normalize(new Map([["a", 5], ["b", 5]]));
    expect(result.get("a")).toBe(1);
    expect(result.get("b")).toBe(1);
  });

  it("inverts for lower-is-better metrics", () => {
    const result = normalizeInverse(new Map([["cheap", 1], ["dear", 9]]));
    expect(result.get("cheap")).toBe(1);
    expect(result.get("dear")).toBe(0);
  });
});

describe("cell summaries", () => {
  it("reports reliability as the share of fully-passing reps", () => {
    const summary = summarizeCell("m::harnessed", [1, 1, 0.4]);
    expect(summary.n).toBe(3);
    expect(summary.reliability).toBeCloseTo(2 / 3, 6);
    expect(summary.mean).toBeCloseTo(0.8, 6);
  });

  it("distinguishes two perfect runs plus a failure from three mediocre ones", () => {
    const mixed = summarizeCell("mixed", [1, 1, 0]);
    const flat = summarizeCell("flat", [0.667, 0.667, 0.666]);
    expect(mixed.mean).toBeCloseTo(flat.mean, 2);
    expect(mixed.reliability).toBeGreaterThan(flat.reliability);
    expect(mixed.stdev).toBeGreaterThan(flat.stdev);
  });
});

describe("harness delta", () => {
  it("reports the signed difference between conditions", () => {
    const delta = harnessDelta("opus5", [0.9, 0.9, 0.9], [0.5, 0.5, 0.5]);
    expect(delta.delta).toBeCloseTo(0.4, 6);
    expect(delta.testable).toBe(true);
    expect(delta.separated).toBe(true);
  });

  it("refuses to claim separation when the intervals overlap", () => {
    const delta = harnessDelta("opus5", [0.6, 0.4, 0.8], [0.5, 0.7, 0.3]);
    expect(delta.separated).toBe(false);
  });

  it("never claims separation at n=1, where a point interval always separates", () => {
    // The regression this pins: at one rep the bootstrap CI collapses to a
    // point, so ANY two different means would read as "separated" — exactly
    // the false confidence the tool exists to prevent.
    const delta = harnessDelta("opus5", [0.72], [0.66]);
    expect(delta.delta).toBeCloseTo(0.06, 6);
    expect(delta.testable).toBe(false);
    expect(delta.separated).toBe(false);
  });

  it("still refuses at n=2, below the stated floor", () => {
    const delta = harnessDelta("opus5", [0.9, 0.9], [0.1, 0.1]);
    expect(delta.testable).toBe(false);
    expect(delta.separated).toBe(false);
  });

  it("becomes testable at the stated minimum rep count", () => {
    const values = Array.from({ length: MIN_REPS_FOR_SEPARATION }, () => 0.9);
    const others = Array.from({ length: MIN_REPS_FOR_SEPARATION }, () => 0.1);
    expect(harnessDelta("opus5", values, others).testable).toBe(true);
  });

  it("never claims separation when one condition has no data", () => {
    const delta = harnessDelta("opus5", [0.9, 0.9, 0.9], []);
    expect(delta.separated).toBe(false);
    expect(delta.testable).toBe(false);
  });

  it("reports a negative delta when the harness hurt", () => {
    const delta = harnessDelta("sonnet5", [0.3, 0.3, 0.3], [0.8, 0.8, 0.8]);
    expect(delta.delta).toBeLessThan(0);
  });
});

describe("correlation", () => {
  it("returns 1 for a perfect positive relationship", () => {
    expect(correlation([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 6);
  });

  it("returns -1 for a perfect inverse relationship", () => {
    expect(correlation([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1, 6);
  });

  it("returns null, not 0, when one series has no variance", () => {
    // Reporting 0 here would render as "judges and tests disagree" when in
    // fact every arm scored identically and nothing can be inferred.
    expect(correlation([1, 1, 1], [1, 2, 3])).toBeNull();
  });

  it("returns null when every arm passed every acceptance test", () => {
    expect(correlation([0.8, 0.9, 0.7], [1, 1, 1])).toBeNull();
  });

  it("returns null for fewer than two observations", () => {
    expect(correlation([1], [2])).toBeNull();
  });
});
