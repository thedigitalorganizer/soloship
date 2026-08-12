// Gauntlet — arm execution.
//
// Provisions one worktree per arm, launches the agent under wall-clock and
// dollar caps, captures whatever it left behind, and records telemetry.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  invokeAgent,
  needsSandboxEscape,
  parseTelemetry,
  emptyTelemetry,
} from "./adapters.js";
import { expandArms, runDir } from "./config.js";
import {
  captureArmResult,
  diffStat,
  provisionArmWorktree,
} from "./workspace.js";
import type { Arm, ArmRunResult, GauntletConfig } from "./types.js";

/** Filename holding the per-arm run results inside the run directory. */
export const RESULTS_FILENAME = "run-results.json";
/** Subdirectory holding raw agent stdout/stderr per arm. */
export const LOGS_SUBDIR = "logs";

/**
 * Appended to EVERY arm's prompt, identically, in both conditions.
 *
 * Arms run unattended, so every "stop and ask the user" checkpoint would
 * otherwise deadlock a harnessed arm while a bare arm sailed on — measuring the
 * absence of a human, not the harness. Giving both conditions the same
 * autonomy contract removes that artifact.
 */
export const AUTONOMY_CLAUSE = `
---
## Run conditions (identical for every participant)

You are running unattended. Nobody will answer a question, so do not ask one.
Where the task is ambiguous, choose the most reasonable interpretation, write
it down in DECISIONS.md at the repo root, and continue.

Work only inside this repository. Commit your work when you are done; if you
do not commit, your final working tree is captured automatically.

Stop when the task is complete and verified, or when you judge that continuing
would not improve the result.
`;

/**
 * Prepended to harnessed arms only. This is the independent variable: the bare
 * arm gets the same facts and the same autonomy contract, and differs only in
 * whether the Soloship methodology is loaded and invoked.
 */
export const HARNESS_PREAMBLE = `Use the Soloship workflow for this task: plan
the work first with /soloship:plan, then execute it with /soloship:implement,
and honour the always-on rules that load with them. Skip any step that would
require asking a human a question.

`;

export function buildPrompt(brief: string, arm: Arm): string {
  const body = `${brief.trim()}\n${AUTONOMY_CLAUSE}`;
  return arm.condition === "harnessed" ? `${HARNESS_PREAMBLE}${body}` : body;
}

export function readBrief(config: GauntletConfig): string {
  const path = join(runDir(config.repoRoot, config.runId), config.course.briefPath);
  if (!existsSync(path)) {
    throw new Error(`Course brief not found at ${path}.`);
  }
  return readFileSync(path, "utf-8");
}

export interface RunOptions {
  config: GauntletConfig;
  /** Restrict the run to these arm ids. Empty means all arms. */
  only?: string[];
  /** Re-run arms that already have results. */
  force?: boolean;
  onEvent?: (message: string) => void;
}

/** Execute one arm start to finish. Never throws; failures become results. */
export async function runArm(
  config: GauntletConfig,
  arm: Arm,
  brief: string,
  onEvent?: (message: string) => void
): Promise<ArmRunResult> {
  const adapter = config.adapters[arm.adapter];
  const base: ArmRunResult = {
    armId: arm.id,
    status: "error",
    exitCode: null,
    telemetry: emptyTelemetry(0),
    headSha: null,
    filesChanged: 0,
    linesChanged: 0,
  };

  if (!adapter) {
    return { ...base, error: `unknown adapter "${arm.adapter}"` };
  }

  let worktree: string;
  try {
    worktree = provisionArmWorktree({
      repoRoot: config.repoRoot,
      runId: config.runId,
      armId: arm.id,
      branch: arm.branch,
      baseline: config.baseline,
    });
  } catch (error) {
    return { ...base, error: `worktree: ${(error as Error).message}` };
  }

  onEvent?.(`[${arm.id}] starting (${arm.modelLabel}, ${arm.condition})`);

  const invocation = await invokeAgent({
    adapter,
    condition: arm.condition,
    timeoutSec: config.limits.armTimeoutSec,
    values: {
      prompt: buildPrompt(brief, arm),
      model: arm.model,
      cwd: worktree,
      pluginRoot: config.pluginRoot ?? "",
      budgetUsd: String(config.limits.armBudgetUsd),
    },
  });

  const logsDir = join(runDir(config.repoRoot, config.runId), LOGS_SUBDIR);
  mkdirSync(logsDir, { recursive: true });
  writeFileSync(join(logsDir, `${arm.id}.stdout.log`), invocation.stdout, "utf-8");
  writeFileSync(join(logsDir, `${arm.id}.stderr.log`), invocation.stderr, "utf-8");

  const telemetry = parseTelemetry(
    adapter,
    invocation.stdout,
    invocation.wallClockSec
  );

  let headSha: string | null = null;
  try {
    headSha = captureArmResult(worktree, `gauntlet(${arm.id}): captured result`);
  } catch (error) {
    onEvent?.(`[${arm.id}] capture failed: ${(error as Error).message}`);
  }

  const stat = headSha
    ? diffStat(config.repoRoot, config.baseline, headSha)
    : { filesChanged: 0, linesChanged: 0, paths: [] };

  const status: ArmRunResult["status"] = invocation.timedOut
    ? "timeout"
    : invocation.exitCode === 0
      ? "completed"
      : "error";

  onEvent?.(
    `[${arm.id}] ${status} in ${invocation.wallClockSec.toFixed(1)}s, ` +
      `${stat.filesChanged} files, ${telemetry.costUsd === null ? "cost n/a" : `$${telemetry.costUsd.toFixed(2)}`}`
  );

  return {
    armId: arm.id,
    status,
    exitCode: invocation.exitCode,
    telemetry,
    headSha,
    filesChanged: stat.filesChanged,
    linesChanged: stat.linesChanged,
    error: invocation.timedOut
      ? `timed out after ${config.limits.armTimeoutSec}s`
      : undefined,
  };
}

/** Run every selected arm, bounded by concurrency and the run-level budget. */
export async function runGauntlet(options: RunOptions): Promise<ArmRunResult[]> {
  const { config, onEvent } = options;
  const brief = readBrief(config);
  const allArms = expandArms(config);
  const selected =
    options.only && options.only.length > 0
      ? allArms.filter((arm) => options.only!.includes(arm.id))
      : allArms;

  const existing = readResults(config);
  const done = new Map(existing.map((result) => [result.armId, result]));
  const queue = selected.filter(
    (arm) => options.force || !done.has(arm.id) || done.get(arm.id)!.status === "error"
  );

  onEvent?.(
    `${queue.length} arm(s) to run of ${selected.length} selected ` +
      `(concurrency ${config.limits.concurrency}, run budget $${config.limits.runBudgetUsd})`
  );
  if (needsSandboxEscape()) {
    onEvent?.(
      "running as root: setting IS_SANDBOX=1 so agents can run unattended — permission prompts are bypassed for every arm"
    );
  }

  const results: ArmRunResult[] = existing.filter(
    (result) => !queue.some((arm) => arm.id === result.armId)
  );
  let spent = results.reduce(
    (total, result) => total + (result.telemetry.costUsd ?? 0),
    0
  );
  let index = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const current = index;
      index += 1;
      if (current >= queue.length) return;
      const arm = queue[current];

      if (spent >= config.limits.runBudgetUsd) {
        onEvent?.(`[${arm.id}] skipped — run budget exhausted ($${spent.toFixed(2)})`);
        results.push({
          armId: arm.id,
          status: "skipped",
          exitCode: null,
          telemetry: emptyTelemetry(0),
          headSha: null,
          filesChanged: 0,
          linesChanged: 0,
          error: "run budget exhausted",
        });
        continue;
      }

      const result = await runArm(config, arm, brief, onEvent);
      spent += result.telemetry.costUsd ?? 0;
      results.push(result);
      writeResults(config, results);
    }
  };

  const workers = Array.from(
    { length: Math.min(config.limits.concurrency, Math.max(queue.length, 1)) },
    () => worker()
  );
  await Promise.all(workers);

  results.sort((a, b) => a.armId.localeCompare(b.armId));
  writeResults(config, results);
  return results;
}

export function resultsPath(config: GauntletConfig): string {
  return join(runDir(config.repoRoot, config.runId), RESULTS_FILENAME);
}

export function readResults(config: GauntletConfig): ArmRunResult[] {
  const path = resultsPath(config);
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf-8")) as ArmRunResult[];
}

export function writeResults(
  config: GauntletConfig,
  results: ArmRunResult[]
): void {
  mkdirSync(runDir(config.repoRoot, config.runId), { recursive: true });
  writeFileSync(
    resultsPath(config),
    `${JSON.stringify(results, null, 2)}\n`,
    "utf-8"
  );
}
