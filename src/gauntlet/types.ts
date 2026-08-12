// Gauntlet — shared types.
//
// A "gauntlet" is one sealed task (the COURSE) attempted independently by many
// ARMS, where an arm is a unique (agent x model x condition x rep) combination.
// Nothing here knows how to merge anything; see docs/plans/2026-08-12-model-gauntlet.md
// Key Decision 10.

/** Which harness the arm runs under. This is the Soloship-vs-bare axis. */
export type Condition = "harnessed" | "bare";

export const CONDITIONS: readonly Condition[] = ["harnessed", "bare"] as const;

/**
 * How to invoke one agent CLI non-interactively.
 *
 * Adapters are declarative so a new vendor (Grok, or whatever ships next) is a
 * config entry rather than a code change. Placeholders available in argv
 * entries and env values: {{prompt}}, {{model}}, {{cwd}}, {{pluginRoot}},
 * {{budgetUsd}}.
 */
export interface AgentAdapter {
  /** Adapter id, e.g. "claude", "codex", "generic". */
  id: string;
  /** Executable resolved on PATH. */
  command: string;
  /** Argv template shared by both conditions. */
  baseArgs: string[];
  /** Extra argv appended when condition === "harnessed". */
  harnessedArgs: string[];
  /** Extra argv appended when condition === "bare". */
  bareArgs: string[];
  /** Extra environment applied to the child process. */
  env?: Record<string, string>;
  /**
   * How the adapter reports usage. "claude-json" parses Claude Code's
   * --output-format json envelope; "none" means wall-clock only, which is the
   * honest floor for any vendor without shared telemetry.
   */
  telemetry: "claude-json" | "codex-json" | "none";
  /** Send the prompt on stdin instead of as an argv placeholder. */
  promptOnStdin?: boolean;
}

/** One model entry under test. */
export interface ModelSpec {
  /** Stable slug used in arm ids and branch names, e.g. "opus5". */
  id: string;
  /** Adapter id this model runs through. */
  adapter: string;
  /** Value passed to the adapter's {{model}} placeholder. */
  model: string;
  /** Human label for reports. */
  label: string;
  /** Conditions to run for this model. Defaults to the run-level conditions. */
  conditions?: Condition[];
}

/** The sealed task definition. Written before any arm runs; never edited after. */
export interface CourseSpec {
  /** Course id, used in report titles. */
  id: string;
  /** Path (relative to the gauntlet dir) of the brief handed to every arm. */
  briefPath: string;
  /** Directory of hidden acceptance tests. Never copied into an arm's tree. */
  acceptancePath: string;
  /** Command run inside a scoring checkout with acceptance tests present. */
  acceptanceCommand: string;
  /** Command that runs the host project's own suite (regression signal). */
  regressionCommand?: string;
  /** Optional setup command run in each scoring checkout before the others. */
  setupCommand?: string;
  /**
   * Patch file applied during calibration to prove acceptance can pass. This is
   * what makes a course an instrument instead of a wish.
   */
  referencePatch?: string;
  /** Paths that must not change. Touching one is a scope-discipline failure. */
  trapPaths: string[];
}

/** Blinding and judging configuration. */
export interface ReviewSpec {
  /** Adapter id used to run reviewers. */
  adapter: string;
  /** Model reviewers run on. Held fixed to remove a confound. */
  model: string;
  /** How many independent rubric reviewers per submission. */
  reviewersPerSubmission: number;
  /** Pairwise tournament mode. */
  pairwise: "all" | "off";
  /** Only these path globs reach reviewers. Empty means "everything not excluded". */
  includePaths: string[];
  /** Paths stripped before review — process artifacts leak the condition. */
  excludePaths: string[];
  /** Extra regexes scrubbed from the anonymized diff, on top of the built-ins. */
  extraScrubPatterns: string[];
}

/** Weights for the composite column. Printed next to the number in every report. */
export interface ScoreWeights {
  acceptance: number;
  regression: number;
  scope: number;
  rubric: number;
  pairwise: number;
}

/** The whole run configuration, persisted as gauntlet.json. */
export interface GauntletConfig {
  runId: string;
  /** Absolute path to the repo under test. */
  repoRoot: string;
  /** Commit every arm starts from. Pinned at init, never re-resolved. */
  baseline: string;
  /** Branch prefix. Arms land on `${branchPrefix}/${armId}`. */
  branchPrefix: string;
  course: CourseSpec;
  models: ModelSpec[];
  conditions: Condition[];
  reps: number;
  adapters: Record<string, AgentAdapter>;
  review: ReviewSpec;
  weights: ScoreWeights;
  limits: {
    /** Per-arm wall-clock cap. */
    armTimeoutSec: number;
    /** Per-arm spend cap, passed through where the adapter supports it. */
    armBudgetUsd: number;
    /** Run-level spend ceiling; arms not yet launched are skipped past it. */
    runBudgetUsd: number;
    /** How many arms run at once. */
    concurrency: number;
  };
  /** Absolute path to the Soloship plugin root used by harnessed arms. */
  pluginRoot?: string;
}

/** One arm: the unit of execution and of scoring. */
export interface Arm {
  id: string;
  modelId: string;
  modelLabel: string;
  adapter: string;
  model: string;
  condition: Condition;
  rep: number;
  branch: string;
}

/** Telemetry captured from one arm's run. Unavailable fields stay null, never 0. */
export interface ArmTelemetry {
  wallClockSec: number;
  costUsd: number | null;
  turns: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

/** Result of executing one arm. */
export interface ArmRunResult {
  armId: string;
  status: "completed" | "timeout" | "error" | "skipped";
  exitCode: number | null;
  telemetry: ArmTelemetry;
  headSha: string | null;
  filesChanged: number;
  linesChanged: number;
  error?: string;
}

/** Result of mechanically scoring one arm. Contains no model identity by design. */
export interface ArmScore {
  armId: string;
  acceptancePassed: number;
  acceptanceTotal: number;
  acceptanceRatio: number;
  regressionPassed: boolean | null;
  trapsTouched: string[];
  scopeClean: boolean;
}

/** One reviewer's rubric verdict on one anonymized submission. */
export interface RubricVerdict {
  codename: string;
  reviewer: number;
  scores: Record<string, number>;
  weightedTotal: number;
  blockingIssues: string[];
  summary: string;
}

/** One order-balanced pairwise comparison. */
export interface PairwiseVerdict {
  left: string;
  right: string;
  /** Codename of the winner, or null for a genuine tie. */
  winner: string | null;
  reason: string;
}

/** Everything the report needs for one arm. */
export interface ArmReportRow {
  arm: Arm;
  run: ArmRunResult;
  score: ArmScore | null;
  codename: string | null;
  rubricMean: number | null;
  pairwiseStrength: number | null;
  composite: number | null;
}
