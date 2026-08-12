// Gauntlet — configuration defaults, arm expansion, and validation.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type {
  AgentAdapter,
  Arm,
  Condition,
  GauntletConfig,
  ModelSpec,
  ScoreWeights,
} from "./types.js";
import { CONDITIONS } from "./types.js";

/** Directory (under the repo being tested) that holds all gauntlet state. */
export const GAUNTLET_DIR = ".gauntlet";
/** Filename of the persisted run configuration. */
export const CONFIG_FILENAME = "gauntlet.json";
/** Branch namespace. Every arm branch starts with this, which is how the
 *  no-merge guard recognises gauntlet branches. */
export const BRANCH_NAMESPACE = "gauntlet";

/** Default per-arm wall-clock cap: long enough for a real task, short enough
 *  that one stuck arm cannot hold a run hostage overnight. */
export const DEFAULT_ARM_TIMEOUT_SEC = 3600;
/** Default per-arm spend cap in USD. */
export const DEFAULT_ARM_BUDGET_USD = 15;
/** Default run-level spend ceiling in USD. */
export const DEFAULT_RUN_BUDGET_USD = 200;
/** Default number of arms executing at once. */
export const DEFAULT_CONCURRENCY = 3;
/** Default repetitions per (model, condition). Three is the minimum that
 *  separates a real difference from run-to-run variance. */
export const DEFAULT_REPS = 3;
/** Default independent rubric reviewers per submission. */
export const DEFAULT_REVIEWERS_PER_SUBMISSION = 2;
/** Model reviewers run on by default; held fixed to remove a judge confound. */
export const DEFAULT_JUDGE_MODEL = "claude-opus-5";

/**
 * Paths excluded from the reviewed diff — process artifacts announce the
 * harness condition and would defeat the blind.
 *
 * DECISIONS.md is on this list because the shared autonomy clause asks every
 * arm to write one, and a harnessed arm's copy cites the plan file it was
 * executing. Excluding the plan itself while leaving a diff that names it is
 * blinding theatre; found in the first live run of this tool.
 */
export const DEFAULT_REVIEW_EXCLUDES = [
  "docs/",
  ".ai/",
  ".claude/",
  ".codex/",
  ".gauntlet/",
  "AGENTS.md",
  "CLAUDE.md",
  "DECISIONS.md",
];

/** Composite weights. Printed beside the composite in every report so the
 *  number is never mistaken for an objective truth. */
export const DEFAULT_WEIGHTS: ScoreWeights = {
  acceptance: 0.4,
  regression: 0.1,
  scope: 0.1,
  rubric: 0.2,
  pairwise: 0.2,
};

/**
 * Built-in adapters.
 *
 * The harnessed/bare split is the whole point of the gauntlet, so it lives in
 * the adapter rather than in ad-hoc call sites:
 *  - claude harnessed: the Soloship plugin is loaded for the session.
 *  - claude bare:      --safe-mode, Claude Code's own switch for "all
 *                      customizations disabled" (CLAUDE.md, skills, plugins,
 *                      hooks, agents). Chosen over deleting files from the
 *                      worktree, which would pollute every bare diff.
 */
export const BUILTIN_ADAPTERS: Record<string, AgentAdapter> = {
  claude: {
    id: "claude",
    command: "claude",
    baseArgs: [
      "-p",
      "{{prompt}}",
      "--model",
      "{{model}}",
      "--output-format",
      "json",
      "--permission-mode",
      "bypassPermissions",
      "--max-budget-usd",
      "{{budgetUsd}}",
    ],
    harnessedArgs: ["--plugin-dir", "{{pluginRoot}}"],
    bareArgs: ["--safe-mode"],
    telemetry: "claude-json",
  },
  codex: {
    id: "codex",
    command: "codex",
    baseArgs: [
      "exec",
      "--model",
      "{{model}}",
      "--sandbox",
      "workspace-write",
      "--json",
      "{{prompt}}",
    ],
    harnessedArgs: [],
    bareArgs: [],
    telemetry: "codex-json",
  },
  /**
   * Escape hatch for any other CLI (Grok and friends). Fill in `command` and
   * `baseArgs` with {{prompt}}/{{model}} placeholders. Telemetry degrades to
   * wall-clock, which is the only metric comparable across vendors anyway.
   */
  generic: {
    id: "generic",
    command: "echo",
    baseArgs: ["{{prompt}}"],
    harnessedArgs: [],
    bareArgs: [],
    telemetry: "none",
  },
};

/** Slugify a free-form label into something safe for a branch name. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Expand the configured models x conditions x reps into the concrete arm list.
 * Arm ids are the only identity that travels with the work; they are
 * deliberately NOT used in anything a reviewer sees.
 */
export function expandArms(config: GauntletConfig): Arm[] {
  const arms: Arm[] = [];
  for (const model of config.models) {
    const conditions = model.conditions ?? config.conditions;
    for (const condition of conditions) {
      for (let rep = 1; rep <= config.reps; rep += 1) {
        const id = `${slugify(model.id)}-${condition}-r${rep}`;
        arms.push({
          id,
          modelId: model.id,
          modelLabel: model.label,
          adapter: model.adapter,
          model: model.model,
          condition,
          rep,
          branch: `${config.branchPrefix}/${id}`,
        });
      }
    }
  }
  return arms;
}

/** Human-readable label for an arm group (a model+condition cell, across reps). */
export function cellKey(arm: Arm): string {
  return `${arm.modelId}::${arm.condition}`;
}

export interface ValidationIssue {
  field: string;
  message: string;
}

/**
 * Validate a config before anything expensive or irreversible happens.
 *
 * The branch-namespace check is the mechanical half of the no-merge guarantee:
 * an arm can never be given the name of a branch anyone would merge into.
 */
export function validateConfig(
  config: GauntletConfig,
  protectedBranches: string[] = ["main", "master"]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!config.runId) issues.push({ field: "runId", message: "missing run id" });
  if (!config.baseline) {
    issues.push({ field: "baseline", message: "baseline commit is not pinned" });
  }
  if (!config.branchPrefix.startsWith(`${BRANCH_NAMESPACE}/`)) {
    issues.push({
      field: "branchPrefix",
      message: `branch prefix must start with "${BRANCH_NAMESPACE}/" so gauntlet branches are always identifiable`,
    });
  }
  if (config.models.length === 0) {
    issues.push({ field: "models", message: "no models configured" });
  }
  if (config.reps < 1) {
    issues.push({ field: "reps", message: "reps must be at least 1" });
  }
  if (config.limits.concurrency < 1) {
    issues.push({ field: "limits.concurrency", message: "concurrency must be at least 1" });
  }

  for (const model of config.models) {
    if (!config.adapters[model.adapter]) {
      issues.push({
        field: `models.${model.id}.adapter`,
        message: `unknown adapter "${model.adapter}"`,
      });
    }
    for (const condition of model.conditions ?? config.conditions) {
      if (!CONDITIONS.includes(condition)) {
        issues.push({
          field: `models.${model.id}.conditions`,
          message: `unknown condition "${condition}"`,
        });
      }
    }
  }

  if (!config.adapters[config.review.adapter]) {
    issues.push({
      field: "review.adapter",
      message: `unknown review adapter "${config.review.adapter}"`,
    });
  }

  for (const arm of expandArms(config)) {
    const leaf = arm.branch.split("/").pop() ?? "";
    if (protectedBranches.includes(arm.branch) || protectedBranches.includes(leaf)) {
      issues.push({
        field: "branch",
        message: `arm "${arm.id}" would produce protected branch "${arm.branch}"`,
      });
    }
  }

  return issues;
}

/** Markers that an adapter routes through OpenRouter. */
const OPENROUTER_MARKERS = /openrouter|open-router/i;
/** Markers that provider routing has been pinned. Without pinning, the same
 *  model slug can be served by different providers at different quantizations
 *  between one request and the next, so the run measures the router's choices
 *  rather than the models. */
const PINNING_MARKERS =
  /allow_fallbacks|allow-fallbacks|ALLOW_FALLBACKS|provider[._-]?order|provider[._-]?only|quantizations?/i;

/**
 * Non-blocking validity warnings.
 *
 * Kept separate from validateConfig because these describe ways a run can
 * produce meaningless numbers rather than fail outright — and because pinning
 * can legitimately be configured account-side, where nothing in the local
 * config would show it.
 */
export function configWarnings(config: GauntletConfig): string[] {
  const warnings: string[] = [];

  for (const [name, adapter] of Object.entries(config.adapters)) {
    const used = config.models.some((model) => model.adapter === name);
    if (!used) continue;
    const surface = [
      adapter.command,
      ...adapter.baseArgs,
      ...Object.keys(adapter.env ?? {}),
      ...Object.values(adapter.env ?? {}),
    ].join(" ");
    if (!OPENROUTER_MARKERS.test(surface + name)) continue;
    if (!PINNING_MARKERS.test(surface)) {
      warnings.push(
        `adapter "${name}" routes through OpenRouter with no provider pinning in sight. ` +
          `Unpinned, one model slug can be served by different providers at different ` +
          `quantizations between requests, so the run measures routing luck rather than models. ` +
          `Set allow_fallbacks=false and an explicit provider order, or confirm it is pinned account-side.`
      );
    }
  }

  // Mixing gateway-routed and direct arms puts a network hop in some arms'
  // wall-clock and not others, which silently corrupts the speed comparison.
  const routed = new Set(
    config.models.map((model) => {
      const adapter = config.adapters[model.adapter];
      if (!adapter) return "unknown";
      const surface = [adapter.command, ...adapter.baseArgs].join(" ");
      return OPENROUTER_MARKERS.test(surface + model.adapter) ? "gateway" : "direct";
    })
  );
  if (routed.has("gateway") && routed.has("direct")) {
    warnings.push(
      "this run mixes OpenRouter-routed and direct arms. The gateway adds a network hop, " +
        "so the routed arms carry latency the direct ones do not and the speed comparison is not valid. " +
        "Split them into two gauntlets on the same course and baseline."
    );
  }

  return warnings;
}

/** Sensible starting models: the three Claude tiers Shawn asked about, both
 *  conditions. Codex/Grok entries are written commented-alongside in the skill
 *  reference rather than enabled blind, since their CLIs may not be installed. */
export function defaultModels(): ModelSpec[] {
  return [
    { id: "opus5", adapter: "claude", model: "claude-opus-5", label: "Opus 5" },
    { id: "sonnet5", adapter: "claude", model: "claude-sonnet-5", label: "Sonnet 5" },
    { id: "fable5", adapter: "claude", model: "claude-fable-5", label: "Fable 5" },
  ];
}

export interface ScaffoldOptions {
  repoRoot: string;
  runId: string;
  baseline: string;
  pluginRoot?: string;
  models?: ModelSpec[];
  conditions?: Condition[];
  reps?: number;
  judgeModel?: string;
}

/** Build a fully-defaulted config object. */
export function buildConfig(options: ScaffoldOptions): GauntletConfig {
  return {
    runId: options.runId,
    repoRoot: resolve(options.repoRoot),
    baseline: options.baseline,
    branchPrefix: `${BRANCH_NAMESPACE}/${options.runId}`,
    course: {
      id: options.runId,
      briefPath: "course/BRIEF.md",
      acceptancePath: "course/acceptance",
      acceptanceCommand: "npm run gauntlet:accept",
      regressionCommand: "npm test",
      referencePatch: "course/reference.patch",
      trapPaths: [],
    },
    models: options.models ?? defaultModels(),
    conditions: options.conditions ?? [...CONDITIONS],
    reps: options.reps ?? DEFAULT_REPS,
    adapters: { ...BUILTIN_ADAPTERS },
    review: {
      adapter: "claude",
      model: options.judgeModel ?? DEFAULT_JUDGE_MODEL,
      reviewersPerSubmission: DEFAULT_REVIEWERS_PER_SUBMISSION,
      pairwise: "all",
      includePaths: [],
      excludePaths: [...DEFAULT_REVIEW_EXCLUDES],
      extraScrubPatterns: [],
    },
    weights: { ...DEFAULT_WEIGHTS },
    limits: {
      armTimeoutSec: DEFAULT_ARM_TIMEOUT_SEC,
      armBudgetUsd: DEFAULT_ARM_BUDGET_USD,
      runBudgetUsd: DEFAULT_RUN_BUDGET_USD,
      concurrency: DEFAULT_CONCURRENCY,
    },
    pluginRoot: options.pluginRoot,
  };
}

/** Absolute path of a run's state directory. */
export function runDir(repoRoot: string, runId: string): string {
  return join(resolve(repoRoot), GAUNTLET_DIR, runId);
}

export function configPath(repoRoot: string, runId: string): string {
  return join(runDir(repoRoot, runId), CONFIG_FILENAME);
}

export function writeConfig(config: GauntletConfig): string {
  const dir = runDir(config.repoRoot, config.runId);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, CONFIG_FILENAME);
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
  return path;
}

export function readConfig(repoRoot: string, runId: string): GauntletConfig {
  const path = configPath(repoRoot, runId);
  if (!existsSync(path)) {
    throw new Error(
      `No gauntlet config at ${path}. Run "soloship gauntlet init" first.`
    );
  }
  return JSON.parse(readFileSync(path, "utf-8")) as GauntletConfig;
}
