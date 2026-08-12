// Gauntlet — pure statistics. No I/O, no git, no model identity.
//
// Methodology follows the established agent-evaluation literature rather than
// being invented here:
//  - Order-balanced pairwise judging + Bradley-Terry aggregation + bootstrap
//    confidence intervals: Arena-Hard / MT-Bench (arXiv 2306.05685).
//  - pass@1 averaged over repeated attempts per cell: Artificial Analysis
//    Coding Agent Index, Terminal-Bench multi-trial protocol.
//  - Harness dependence (cross-condition variance per model): Harness-Bench
//    (arXiv 2605.27922), which is the closest prior art to the question this
//    tool exists to answer.

/** Iterations for the Bradley-Terry fixed-point fit. Converges well before
 *  this on realistic tallies; the cap only bounds pathological input. */
export const BT_MAX_ITERATIONS = 500;
/** Convergence threshold for the BT fit. */
export const BT_TOLERANCE = 1e-9;
/** Smoothing added to every pairing so an undefeated arm yields a finite
 *  strength instead of diverging to infinity. */
export const BT_PRIOR = 0.5;
/** Bootstrap resamples used for confidence intervals. */
export const BOOTSTRAP_SAMPLES = 1000;
/** Confidence level reported for every interval. */
export const CONFIDENCE_LEVEL = 0.95;
/** Fixed seed so a rerun of `gauntlet report` reproduces the same intervals. */
export const DEFAULT_SEED = 20260812;
/**
 * Reps required in BOTH cells before a separation claim is allowed.
 *
 * At n=1 the percentile bootstrap collapses to a point interval, so two cells
 * can never overlap and `separated` would read `yes` for every pair — the exact
 * false confidence this tool exists to prevent. At n=2 the interval is still
 * essentially uninformative. Below this floor the honest answer is "this run
 * cannot tell", and that is what gets reported.
 */
export const MIN_REPS_FOR_SEPARATION = 3;

/** Deterministic PRNG (mulberry32) — reproducible intervals beat fresh noise. */
export function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/** Sample standard deviation. Returns 0 for fewer than two observations —
 *  n=1 has no spread to report, and pretending otherwise is the exact error
 *  the prior Fable A/B flagged in its own limits. */
export function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance =
    values.reduce((total, value) => total + (value - m) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

export interface Interval {
  low: number;
  high: number;
}

/** Percentile bootstrap CI of the mean. */
export function bootstrapMeanCI(
  values: number[],
  options: { samples?: number; level?: number; seed?: number } = {}
): Interval {
  const samples = options.samples ?? BOOTSTRAP_SAMPLES;
  const level = options.level ?? CONFIDENCE_LEVEL;
  const rng = makeRng(options.seed ?? DEFAULT_SEED);

  if (values.length === 0) return { low: 0, high: 0 };
  if (values.length === 1) return { low: values[0], high: values[0] };

  const means: number[] = [];
  for (let i = 0; i < samples; i += 1) {
    let total = 0;
    for (let j = 0; j < values.length; j += 1) {
      total += values[Math.floor(rng() * values.length)];
    }
    means.push(total / values.length);
  }
  means.sort((a, b) => a - b);
  const tail = (1 - level) / 2;
  return {
    low: means[Math.floor(tail * (means.length - 1))],
    high: means[Math.ceil((1 - tail) * (means.length - 1))],
  };
}

export interface PairwiseTally {
  /** winner codename -> loser codename -> win count */
  wins: Map<string, Map<string, number>>;
  competitors: string[];
}

export interface PairwiseComparison {
  left: string;
  right: string;
  winner: string | null;
}

/**
 * Build a win tally. Ties award half a win to each side, which is what keeps a
 * judge's honest "these are equivalent" from being silently discarded.
 */
export function tallyPairwise(
  comparisons: PairwiseComparison[]
): PairwiseTally {
  const wins = new Map<string, Map<string, number>>();
  const competitors = new Set<string>();

  const add = (winner: string, loser: string, amount: number) => {
    if (!wins.has(winner)) wins.set(winner, new Map());
    const row = wins.get(winner)!;
    row.set(loser, (row.get(loser) ?? 0) + amount);
  };

  for (const comparison of comparisons) {
    competitors.add(comparison.left);
    competitors.add(comparison.right);
    if (comparison.winner === null) {
      add(comparison.left, comparison.right, 0.5);
      add(comparison.right, comparison.left, 0.5);
    } else {
      const loser =
        comparison.winner === comparison.left ? comparison.right : comparison.left;
      add(comparison.winner, loser, 1);
    }
  }

  return { wins, competitors: [...competitors].sort() };
}

/**
 * Fit Bradley-Terry strengths by the standard MM/Zermelo fixed point, with a
 * small symmetric prior so undefeated competitors stay finite. Strengths are
 * normalized to sum to 1, so they read as "share of expected wins".
 */
export function bradleyTerry(tally: PairwiseTally): Map<string, number> {
  const { competitors } = tally;
  const strengths = new Map<string, number>(
    competitors.map((name) => [name, 1])
  );
  if (competitors.length < 2) {
    return new Map(competitors.map((name) => [name, 1]));
  }

  const winsAgainst = (a: string, b: string): number =>
    (tally.wins.get(a)?.get(b) ?? 0) + BT_PRIOR;

  for (let iteration = 0; iteration < BT_MAX_ITERATIONS; iteration += 1) {
    let maxDelta = 0;
    for (const player of competitors) {
      let totalWins = 0;
      let denominator = 0;
      for (const opponent of competitors) {
        if (opponent === player) continue;
        const w = winsAgainst(player, opponent);
        const l = winsAgainst(opponent, player);
        totalWins += w;
        denominator +=
          (w + l) / (strengths.get(player)! + strengths.get(opponent)!);
      }
      if (denominator === 0) continue;
      const updated = totalWins / denominator;
      maxDelta = Math.max(maxDelta, Math.abs(updated - strengths.get(player)!));
      strengths.set(player, updated);
    }

    const total = [...strengths.values()].reduce((sum, value) => sum + value, 0);
    for (const [name, value] of strengths) strengths.set(name, value / total);
    if (maxDelta < BT_TOLERANCE) break;
  }

  return strengths;
}

/** Min-max normalize to [0,1]. All-equal input maps to 1 — nobody is penalized
 *  for a metric on which every arm tied. */
export function normalize(values: Map<string, number>): Map<string, number> {
  const numbers = [...values.values()];
  if (numbers.length === 0) return new Map();
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  if (max === min) return new Map([...values].map(([key]) => [key, 1]));
  return new Map(
    [...values].map(([key, value]) => [key, (value - min) / (max - min)])
  );
}

/** Inverse min-max normalize — for metrics where lower is better (cost, time). */
export function normalizeInverse(
  values: Map<string, number>
): Map<string, number> {
  return new Map(
    [...normalize(values)].map(([key, value]) => [key, 1 - value])
  );
}

export interface CellSummary {
  key: string;
  n: number;
  mean: number;
  median: number;
  stdev: number;
  ci: Interval;
  /** Fraction of reps that scored a perfect 1.0 — the "did it fully work"
   *  reliability signal a mean alone hides. */
  reliability: number;
}

/** Aggregate one cell (model × condition) across its reps. */
export function summarizeCell(
  key: string,
  values: number[],
  seed = DEFAULT_SEED
): CellSummary {
  return {
    key,
    n: values.length,
    mean: mean(values),
    median: median(values),
    stdev: stdev(values),
    ci: bootstrapMeanCI(values, { seed }),
    reliability:
      values.length === 0
        ? 0
        : values.filter((value) => value >= 1).length / values.length,
  };
}

export interface HarnessDelta {
  modelId: string;
  harnessed: number;
  bare: number;
  delta: number;
  /** True when the bootstrap intervals of the two conditions do not overlap —
   *  the weakest honest claim that the difference is not just run-to-run noise. */
  separated: boolean;
  /** False when either cell has too few reps for the question to be asked at
   *  all, which is a different statement from "the difference is noise". */
  testable: boolean;
}

/**
 * Harness dependence per model: does Soloship help THIS model, and by how much?
 * Harness-Bench's central finding is that this varies by model, so a single
 * "does the harness help" number would be the wrong answer shape.
 */
export function harnessDelta(
  modelId: string,
  harnessedValues: number[],
  bareValues: number[],
  seed = DEFAULT_SEED
): HarnessDelta {
  const h = summarizeCell(`${modelId}::harnessed`, harnessedValues, seed);
  const b = summarizeCell(`${modelId}::bare`, bareValues, seed);
  const enoughReps =
    harnessedValues.length >= MIN_REPS_FOR_SEPARATION &&
    bareValues.length >= MIN_REPS_FOR_SEPARATION;
  const separated =
    enoughReps && (h.ci.low > b.ci.high || b.ci.low > h.ci.high);
  return {
    modelId,
    harnessed: h.mean,
    bare: b.mean,
    delta: h.mean - b.mean,
    separated,
    testable: enoughReps,
  };
}

/**
 * Pearson correlation, or null when it is undefined.
 *
 * Returns null — never 0 — for fewer than two pairs or a series with no
 * variance. Those cases mean "cannot be computed", and reporting them as 0
 * would render as "the judges and the tests disagree" when in fact every arm
 * simply scored the same. That misreading is worse than a blank.
 */
export function correlation(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}
