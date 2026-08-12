// Gauntlet — the scorecard.
//
// Deliberately reports quality, speed, and cost SEPARATELY, then a composite
// with its weights printed beside it. A single blended number would hide the
// only tradeoff worth arguing about: whether the expensive arm was worth it.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expandArms, runDir } from "./config.js";
import { KEYS_FILENAME } from "./anonymize.js";
import { RUBRIC_CRITERIA } from "./review.js";
import {
  bradleyTerry,
  correlation,
  harnessDelta,
  mean,
  normalize,
  summarizeCell,
  tallyPairwise,
  MIN_REPS_FOR_SEPARATION,
  type HarnessDelta,
} from "./stats.js";
import type {
  Arm,
  ArmRunResult,
  ArmScore,
  GauntletConfig,
  PairwiseVerdict,
  RubricVerdict,
} from "./types.js";

/** Filename of the generated scorecard. */
export const REPORT_FILENAME = "SCORECARD.md";
/** Shown wherever a metric the adapter could not supply would otherwise
 *  render as a misleading zero. */
export const UNAVAILABLE = "n/a";

export interface ReportInputs {
  config: GauntletConfig;
  results: ArmRunResult[];
  scores: ArmScore[];
  rubric: RubricVerdict[];
  pairwise: PairwiseVerdict[];
  codenames: Map<string, string>;
}

export interface ArmComputed {
  arm: Arm;
  result: ArmRunResult | undefined;
  score: ArmScore | undefined;
  codename: string | undefined;
  rubricMean: number | null;
  pairwiseStrength: number | null;
  composite: number | null;
}

function fmt(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined || Number.isNaN(value)
    ? UNAVAILABLE
    : value.toFixed(digits);
}

function pct(value: number | null | undefined): string {
  return value === null || value === undefined || Number.isNaN(value)
    ? UNAVAILABLE
    : `${(value * 100).toFixed(0)}%`;
}

/**
 * Compute every derived number for the report.
 *
 * Pairwise strengths are normalized across the field so the composite is not
 * dominated by Bradley-Terry's absolute scale, which shrinks as the field grows.
 */
export function computeRows(inputs: ReportInputs): ArmComputed[] {
  const arms = expandArms(inputs.config);
  const resultsById = new Map(inputs.results.map((r) => [r.armId, r]));
  const scoresById = new Map(inputs.scores.map((s) => [s.armId, s]));

  const rubricByCodename = new Map<string, number[]>();
  for (const verdict of inputs.rubric) {
    const list = rubricByCodename.get(verdict.codename) ?? [];
    list.push(verdict.weightedTotal);
    rubricByCodename.set(verdict.codename, list);
  }

  const strengths = bradleyTerry(tallyPairwise(inputs.pairwise));
  const normalizedStrengths = normalize(strengths);

  return arms.map((arm) => {
    const codename = inputs.codenames.get(arm.id);
    const rubricValues = codename ? rubricByCodename.get(codename) : undefined;
    const rubricMean =
      rubricValues && rubricValues.length > 0 ? mean(rubricValues) : null;
    const pairwiseStrength =
      codename && normalizedStrengths.has(codename)
        ? normalizedStrengths.get(codename)!
        : null;

    const score = scoresById.get(arm.id);
    const weights = inputs.config.weights;
    const parts: { value: number; weight: number }[] = [];
    if (score) {
      parts.push({ value: score.acceptanceRatio, weight: weights.acceptance });
      parts.push({
        value: score.regressionPassed === false ? 0 : 1,
        weight: weights.regression,
      });
      parts.push({ value: score.scopeClean ? 1 : 0, weight: weights.scope });
    }
    if (rubricMean !== null) parts.push({ value: rubricMean, weight: weights.rubric });
    if (pairwiseStrength !== null) {
      parts.push({ value: pairwiseStrength, weight: weights.pairwise });
    }

    // Renormalize over the components that actually exist, so an arm missing a
    // judged component is not silently scored as if it had failed it.
    const weightSum = parts.reduce((total, part) => total + part.weight, 0);
    const composite =
      weightSum === 0
        ? null
        : parts.reduce((total, part) => total + part.value * part.weight, 0) /
          weightSum;

    return {
      arm,
      result: resultsById.get(arm.id),
      score,
      codename,
      rubricMean,
      pairwiseStrength,
      composite,
    };
  });
}

function cellValues(
  rows: ArmComputed[],
  modelId: string,
  condition: string,
  pick: (row: ArmComputed) => number | null
): number[] {
  return rows
    .filter((row) => row.arm.modelId === modelId && row.arm.condition === condition)
    .map(pick)
    .filter((value): value is number => value !== null);
}

/** Per-model harness dependence. Harness-Bench's central finding is that this
 *  varies by model, so a single "does the harness help" number is the wrong
 *  answer shape and is not produced. */
export function computeHarnessDeltas(
  rows: ArmComputed[],
  config: GauntletConfig
): HarnessDelta[] {
  return config.models.map((model) =>
    harnessDelta(
      model.id,
      cellValues(rows, model.id, "harnessed", (row) => row.composite),
      cellValues(rows, model.id, "bare", (row) => row.composite)
    )
  );
}

export function renderScorecard(inputs: ReportInputs): string {
  const { config } = inputs;
  const rows = computeRows(inputs);
  const lines: string[] = [];
  const labelFor = (modelId: string): string =>
    config.models.find((m) => m.id === modelId)?.label ?? modelId;

  lines.push(`# Gauntlet scorecard — ${config.runId}`);
  lines.push("");
  lines.push(
    `Course \`${config.course.id}\` · baseline \`${config.baseline.slice(0, 12)}\` · ` +
      `${config.models.length} model(s) × ${config.conditions.length} condition(s) × ${config.reps} rep(s)`
  );
  lines.push("");
  lines.push(
    "> **Nothing was merged.** Every arm lives on its own branch. Merge commands are at the bottom of this file; run them yourself after reading."
  );
  lines.push("");

  // ---- Per-arm detail -----------------------------------------------------
  lines.push("## Every arm");
  lines.push("");
  lines.push(
    "| Arm | Model | Harness | Rep | Accept | Regress | Scope | Wall | Cost | Rubric | Pairwise | Composite |"
  );
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const row of [...rows].sort(
    (a, b) => (b.composite ?? -1) - (a.composite ?? -1)
  )) {
    const { arm, result, score } = row;
    lines.push(
      `| ${arm.id} | ${arm.modelLabel} | ${arm.condition} | ${arm.rep} | ` +
        `${score ? `${score.acceptancePassed}/${score.acceptanceTotal}` : UNAVAILABLE} | ` +
        `${score?.regressionPassed === null || score === undefined ? UNAVAILABLE : score.regressionPassed ? "pass" : "FAIL"} | ` +
        `${score ? (score.scopeClean ? "clean" : `touched ${score.trapsTouched.length}`) : UNAVAILABLE} | ` +
        `${result ? `${fmt(result.telemetry.wallClockSec, 0)}s` : UNAVAILABLE} | ` +
        `${result?.telemetry.costUsd === null || !result ? UNAVAILABLE : `$${fmt(result.telemetry.costUsd)}`} | ` +
        `${pct(row.rubricMean)} | ${fmt(row.pairwiseStrength)} | **${pct(row.composite)}** |`
    );
  }
  lines.push("");

  // ---- Cell aggregation ---------------------------------------------------
  lines.push("## Model × harness (across reps)");
  lines.push("");
  lines.push(
    "`reliability` is the share of reps that passed acceptance completely — a mean of 0.6 from two perfect runs and one total failure is a different animal from three mediocre ones."
  );
  lines.push("");
  lines.push(
    "| Model | Harness | n | Composite (mean) | 95% CI | Std dev | Reliability | Median wall | Median cost |"
  );
  lines.push("|---|---|---|---|---|---|---|---|---|");
  for (const model of config.models) {
    for (const condition of config.conditions) {
      const composites = cellValues(rows, model.id, condition, (r) => r.composite);
      if (composites.length === 0) continue;
      const summary = summarizeCell(`${model.id}::${condition}`, composites);
      const acceptance = cellValues(
        rows,
        model.id,
        condition,
        (r) => r.score?.acceptanceRatio ?? null
      );
      const reliability = summarizeCell("acc", acceptance).reliability;
      const walls = cellValues(
        rows,
        model.id,
        condition,
        (r) => r.result?.telemetry.wallClockSec ?? null
      );
      const costs = cellValues(
        rows,
        model.id,
        condition,
        (r) => r.result?.telemetry.costUsd ?? null
      );
      lines.push(
        `| ${model.label} | ${condition} | ${summary.n} | ${pct(summary.mean)} | ` +
          `${pct(summary.ci.low)}–${pct(summary.ci.high)} | ${fmt(summary.stdev, 3)} | ` +
          `${pct(reliability)} | ${walls.length ? `${fmt(summarizeCell("w", walls).median, 0)}s` : UNAVAILABLE} | ` +
          `${costs.length ? `$${fmt(summarizeCell("c", costs).median)}` : UNAVAILABLE} |`
      );
    }
  }
  lines.push("");

  // ---- The harness question ----------------------------------------------
  lines.push("## Does the harness earn its keep?");
  lines.push("");
  lines.push(
    `Composite delta of harnessed minus bare, per model. \`separated\` means the two bootstrap intervals do not overlap — the weakest honest claim that a difference is not run-to-run noise. It requires at least ${MIN_REPS_FOR_SEPARATION} reps in both cells; below that the answer is \`untestable\`, which means this run cannot ask the question, not that the difference is real. Even at ${MIN_REPS_FOR_SEPARATION} reps, expect \`no\` for genuine effects.`
  );
  lines.push("");
  lines.push("| Model | Harnessed | Bare | Delta | Intervals separated |");
  lines.push("|---|---|---|---|---|");
  for (const delta of computeHarnessDeltas(rows, config)) {
    const sign = delta.delta >= 0 ? "+" : "";
    lines.push(
      `| ${labelFor(delta.modelId)} | ${pct(delta.harnessed)} | ${pct(delta.bare)} | ` +
        `${sign}${(delta.delta * 100).toFixed(0)}pp | ` +
        `${!delta.testable ? `untestable (n<${MIN_REPS_FOR_SEPARATION})` : delta.separated ? "yes" : "no"} |`
    );
  }
  lines.push("");

  // ---- Efficiency ---------------------------------------------------------
  lines.push("## Quality per dollar, quality per minute");
  lines.push("");
  lines.push("| Arm | Composite | Cost | Per $ | Wall | Per min |");
  lines.push("|---|---|---|---|---|---|");
  for (const row of rows) {
    if (row.composite === null || !row.result) continue;
    const cost = row.result.telemetry.costUsd;
    const wallMin = row.result.telemetry.wallClockSec / 60;
    lines.push(
      `| ${row.arm.id} | ${pct(row.composite)} | ` +
        `${cost === null ? UNAVAILABLE : `$${fmt(cost)}`} | ` +
        `${cost === null || cost === 0 ? UNAVAILABLE : fmt(row.composite / cost)} | ` +
        `${fmt(row.result.telemetry.wallClockSec, 0)}s | ` +
        `${wallMin === 0 ? UNAVAILABLE : fmt(row.composite / wallMin)} |`
    );
  }
  lines.push("");

  // ---- Judge diagnostics --------------------------------------------------
  const judged = rows.filter(
    (row) => row.rubricMean !== null && row.score !== undefined
  );
  lines.push("## Judge diagnostics");
  lines.push("");
  if (judged.length >= 2) {
    const judgeVsMechanical = correlation(
      judged.map((row) => row.rubricMean!),
      judged.map((row) => row.score!.acceptanceRatio)
    );
    const sizeRows = rows.filter(
      (row) => row.rubricMean !== null && row.result !== undefined
    );
    const styleBias = correlation(
      sizeRows.map((row) => row.result!.linesChanged),
      sizeRows.map((row) => row.rubricMean!)
    );
    lines.push(
      judgeVsMechanical === null
        ? `- **Judge vs mechanical agreement:** not computable — one of the two series has no variance (commonly every arm passing every acceptance test). This says nothing about agreement; it means the course did not separate the arms mechanically.`
        : `- **Judge vs mechanical agreement:** r = ${fmt(judgeVsMechanical)} between rubric score and acceptance ratio. Near zero or negative means the judges and the tests disagree about what "good" is — read the diffs before trusting either.`
    );
    lines.push(
      styleBias === null
        ? `- **Style-bias check:** not computable — diff sizes or rubric scores are identical across arms.`
        : `- **Style-bias check:** r = ${fmt(styleBias)} between diff size and rubric score. Strongly positive suggests judges rewarded volume, a documented LLM-judge failure mode, and the rubric ranking should be discounted accordingly.`
    );
    lines.push(
      `- **Judge model:** \`${config.review.model}\`, run with all customizations disabled, ${config.review.reviewersPerSubmission} independent reviewer(s) per submission.`
    );
    if (config.models.some((model) => model.model === config.review.model)) {
      lines.push(
        `- **Self-preference warning:** the judge model is also a contestant. Compare its ranking against the mechanical column before drawing conclusions about that arm.`
      );
    }
  } else {
    lines.push("- Not enough judged submissions to compute diagnostics.");
  }
  lines.push("");

  // ---- Rubric weights (never hide the weights) ---------------------------
  lines.push("## Weights used");
  lines.push("");
  lines.push(
    `Composite: ${Object.entries(config.weights)
      .map(([key, value]) => `${key} ${value}`)
      .join(" · ")}`
  );
  lines.push("");
  lines.push(
    `Rubric: ${RUBRIC_CRITERIA.map((c) => `${c.key} ${c.weight}`).join(" · ")}`
  );
  lines.push("");

  // ---- Handoff ------------------------------------------------------------
  lines.push("## Merge candidates");
  lines.push("");
  lines.push(
    "Nothing here has been merged, pushed, or rebased. Pick a branch, review it yourself, then run its command."
  );
  lines.push("");
  lines.push("```bash");
  for (const row of [...rows].sort(
    (a, b) => (b.composite ?? -1) - (a.composite ?? -1)
  )) {
    if (!row.result?.headSha) continue;
    lines.push(`# ${row.arm.modelLabel} / ${row.arm.condition} — composite ${pct(row.composite)}`);
    lines.push(`git merge --no-ff ${row.arm.branch}`);
  }
  lines.push("```");
  lines.push("");

  lines.push("## Validity limits");
  lines.push("");
  lines.push(
    `- ${config.reps} rep(s) per cell. Anything under 3 cannot separate a model difference from run-to-run variance; treat single-rep numbers as anecdotes.`
  );
  lines.push(
    "- One course. A result here generalizes to tasks that resemble this one, and no further."
  );
  lines.push(
    "- Arms ran unattended. Harnessed workflows that would normally pause for a human ran without one, which is a real difference from day-to-day use."
  );
  lines.push(
    "- Process artifacts (`docs/`, `.ai/`, `.claude/`) were excluded from what judges saw, so the rubric scores the code and not the paperwork."
  );
  lines.push("");

  return lines.join("\n");
}

export function readCodenames(config: GauntletConfig): Map<string, string> {
  const path = join(runDir(config.repoRoot, config.runId), KEYS_FILENAME);
  if (!existsSync(path)) return new Map();
  const raw = JSON.parse(readFileSync(path, "utf-8")) as Record<string, string>;
  return new Map(Object.entries(raw));
}

export function readJsonArray<T>(config: GauntletConfig, filename: string): T[] {
  const path = join(runDir(config.repoRoot, config.runId), filename);
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf-8")) as T[];
}

export function writeScorecard(config: GauntletConfig, markdown: string): string {
  const path = join(runDir(config.repoRoot, config.runId), REPORT_FILENAME);
  writeFileSync(path, `${markdown}\n`, "utf-8");
  return path;
}
