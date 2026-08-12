// Gauntlet — calibration and mechanical scoring.
//
// Nothing in this file knows which model produced which tree. Scoring runs on
// arm ids and file paths only, which is what lets the mechanical ranking act as
// an independent check on the LLM-judged one.

import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runDir } from "./config.js";
import { git, gitQuiet, removeArmWorktree } from "./workspace.js";
import type { ArmScore, GauntletConfig } from "./types.js";

/** Filename holding mechanical scores inside the run directory. */
export const SCORES_FILENAME = "scores.json";
/** Marker an acceptance suite may print to report an exact pass ratio. */
export const ACCEPT_MARKER = "GAUNTLET_ACCEPT";
/** Wall-clock cap for any scoring command. Scoring is not the experiment; a
 *  hung suite must not stall the whole report. */
export const SCORING_TIMEOUT_SEC = 900;

const MS_PER_SEC = 1000;

export interface AcceptanceOutcome {
  passed: number;
  total: number;
  ratio: number;
}

/** A TAP assertion line, e.g. `ok 3 - collapses repeated separators`. */
const TAP_ASSERTION = /^\s*(not )?ok\s+\d+\s+-\s+(.*)$/gm;
/** Test names that are really file or directory rollups rather than assertions.
 *  Counting these as test cases collapses a five-assertion suite into a single
 *  pass/fail, which would make the highest-weighted score component nearly
 *  binary. */
const ROLLUP_NAME = /(\/|\.(?:js|mjs|cjs|ts|mts|cts)\s*$)/;

/** Count individual TAP assertions, ignoring per-file rollup lines. */
export function countTapAssertions(output: string): AcceptanceOutcome | null {
  let passed = 0;
  let total = 0;
  for (const match of output.matchAll(TAP_ASSERTION)) {
    const name = (match[2] ?? "").trim();
    if (name.length === 0 || ROLLUP_NAME.test(name)) continue;
    total += 1;
    if (!match[1]) passed += 1;
  }
  return total === 0 ? null : { passed, total, ratio: passed / total };
}

/**
 * Read a pass/total ratio out of a test runner's output.
 *
 * Tried in order of specificity: an explicit marker the course author controls,
 * then individual TAP assertions, then a runner's summary line, then the exit
 * code. Leaf assertions outrank the summary because runners that spawn a
 * process per file report `1 passed` for a file holding twenty tests, and a
 * near-binary acceptance ratio would flatten the difference between a
 * submission that solved four of five cases and one that solved none.
 *
 * The exit-code fallback is deliberately coarse rather than clever — a ratio
 * invented from unparsed output would corrupt every downstream number.
 */
export function parseAcceptanceOutput(
  output: string,
  exitCode: number
): AcceptanceOutcome {
  const marker = output.match(
    new RegExp(`${ACCEPT_MARKER}\\s+(\\d+)\\s*/\\s*(\\d+)`)
  );
  if (marker) {
    const passed = Number(marker[1]);
    const total = Number(marker[2]);
    return { passed, total, ratio: total === 0 ? 0 : passed / total };
  }

  const assertions = countTapAssertions(output);
  if (assertions) return assertions;

  const tapPass = output.match(/^#\s*pass\s+(\d+)/m);
  const tapFail = output.match(/^#\s*fail\s+(\d+)/m);
  if (tapPass && tapFail) {
    const passed = Number(tapPass[1]);
    const total = passed + Number(tapFail[1]);
    return { passed, total, ratio: total === 0 ? 0 : passed / total };
  }

  const vitestPass = output.match(/Tests\s+(?:.*?)(\d+)\s+passed/);
  const vitestFail = output.match(/Tests\s+(?:.*?)(\d+)\s+failed/);
  if (vitestPass || vitestFail) {
    const passed = vitestPass ? Number(vitestPass[1]) : 0;
    const failed = vitestFail ? Number(vitestFail[1]) : 0;
    const total = passed + failed;
    return { passed, total, ratio: total === 0 ? 0 : passed / total };
  }

  return exitCode === 0
    ? { passed: 1, total: 1, ratio: 1 }
    : { passed: 0, total: 1, ratio: 0 };
}

export interface CommandOutcome {
  exitCode: number;
  output: string;
}

/** Run a shell command in a directory, capturing combined output. */
export function runCommand(
  command: string,
  cwd: string,
  timeoutSec = SCORING_TIMEOUT_SEC
): CommandOutcome {
  try {
    const output = execSync(command, {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutSec * MS_PER_SEC,
      maxBuffer: 32 * 1024 * 1024,
    });
    return { exitCode: 0, output };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return {
      exitCode: failure.status ?? 1,
      output: `${failure.stdout ?? ""}\n${failure.stderr ?? ""}`,
    };
  }
}

/** Create a throwaway checkout of a ref, with the sealed acceptance tests
 *  copied in. The acceptance tests never exist in an arm's own worktree, which
 *  is what keeps them hidden from the agent that is being scored. */
export function makeScoringCheckout(
  config: GauntletConfig,
  ref: string,
  label: string
): string {
  const path = join(tmpdir(), `gauntlet-score-${config.runId}-${label}`);
  if (existsSync(path)) {
    removeArmWorktree(config.repoRoot, path);
  }
  git(config.repoRoot, ["worktree", "add", "--detach", path, ref]);

  const acceptanceSource = join(
    runDir(config.repoRoot, config.runId),
    config.course.acceptancePath
  );
  if (existsSync(acceptanceSource)) {
    const destination = join(path, "gauntlet-acceptance");
    cpSync(acceptanceSource, destination, { recursive: true });
  }
  return path;
}

export function disposeScoringCheckout(
  config: GauntletConfig,
  path: string
): void {
  removeArmWorktree(config.repoRoot, path);
}

export interface CalibrationResult {
  baselineOutcome: AcceptanceOutcome;
  referenceOutcome: AcceptanceOutcome | null;
  discriminates: boolean;
  leakage: string[];
  problems: string[];
}

/**
 * Prove the course is an instrument before any arm burns budget on it.
 *
 * A course whose acceptance tests already pass on the untouched baseline
 * measures nothing, and one whose tests cannot pass even on a known-good patch
 * measures the tests. Both are caught here, and both are hard failures rather
 * than warnings — the whole run's validity rests on this check.
 */
export function calibrateCourse(config: GauntletConfig): CalibrationResult {
  const problems: string[] = [];
  const dir = runDir(config.repoRoot, config.runId);

  const baselinePath = makeScoringCheckout(config, config.baseline, "baseline");
  let baselineOutcome: AcceptanceOutcome;
  let referenceOutcome: AcceptanceOutcome | null = null;

  try {
    if (config.course.setupCommand) {
      runCommand(config.course.setupCommand, baselinePath);
    }
    const baselineRun = runCommand(config.course.acceptanceCommand, baselinePath);
    baselineOutcome = parseAcceptanceOutput(baselineRun.output, baselineRun.exitCode);
    if (baselineOutcome.ratio >= 1) {
      problems.push(
        "Acceptance tests already pass on the untouched baseline — this course cannot distinguish a solution from doing nothing."
      );
    }

    const patchPath = config.course.referencePatch
      ? join(dir, config.course.referencePatch)
      : null;
    if (patchPath && existsSync(patchPath)) {
      const applied = runCommand(`git apply "${patchPath}"`, baselinePath);
      if (applied.exitCode !== 0) {
        problems.push(`Reference patch did not apply: ${applied.output.trim()}`);
      } else {
        if (config.course.setupCommand) {
          runCommand(config.course.setupCommand, baselinePath);
        }
        const referenceRun = runCommand(
          config.course.acceptanceCommand,
          baselinePath
        );
        referenceOutcome = parseAcceptanceOutput(
          referenceRun.output,
          referenceRun.exitCode
        );
        if (referenceOutcome.ratio < 1) {
          problems.push(
            `Acceptance tests do not fully pass on the reference solution (${referenceOutcome.passed}/${referenceOutcome.total}) — the tests, not the arms, would be what the run measures.`
          );
        }
      }
    } else {
      problems.push(
        "No reference patch found — without one, nothing proves the acceptance tests are passable at all."
      );
    }
  } finally {
    disposeScoringCheckout(config, baselinePath);
  }

  return {
    baselineOutcome,
    referenceOutcome,
    discriminates:
      baselineOutcome.ratio < 1 && (referenceOutcome?.ratio ?? 0) >= 1,
    leakage: detectLeakage(config),
    problems,
  };
}

/**
 * Check the brief does not contain the answer. Harness-Bench calls this out
 * explicitly: a task with hidden answer leakage scores the prompt, not the agent.
 */
export function detectLeakage(config: GauntletConfig): string[] {
  const dir = runDir(config.repoRoot, config.runId);
  const briefPath = join(dir, config.course.briefPath);
  const acceptanceDir = join(dir, config.course.acceptancePath);
  const leaks: string[] = [];

  if (!existsSync(briefPath) || !existsSync(acceptanceDir)) return leaks;
  const brief = readFileSync(briefPath, "utf-8");

  const patchPath = config.course.referencePatch
    ? join(dir, config.course.referencePatch)
    : null;
  if (patchPath && existsSync(patchPath)) {
    const patchLines = readFileSync(patchPath, "utf-8")
      .split("\n")
      .filter((line) => line.startsWith("+") && line.trim().length > 12)
      .map((line) => line.slice(1).trim());
    for (const line of patchLines) {
      if (brief.includes(line)) {
        leaks.push(`Brief contains a line from the reference solution: ${line}`);
      }
    }
  }
  return leaks;
}

/** Score one arm's tree against the sealed acceptance tests. */
export function scoreArm(
  config: GauntletConfig,
  armId: string,
  headSha: string
): ArmScore {
  const path = makeScoringCheckout(config, headSha, armId);
  try {
    if (config.course.setupCommand) {
      runCommand(config.course.setupCommand, path);
    }

    const acceptanceRun = runCommand(config.course.acceptanceCommand, path);
    const acceptance = parseAcceptanceOutput(
      acceptanceRun.output,
      acceptanceRun.exitCode
    );

    let regressionPassed: boolean | null = null;
    if (config.course.regressionCommand) {
      regressionPassed =
        runCommand(config.course.regressionCommand, path).exitCode === 0;
    }

    const changed =
      gitQuiet(config.repoRoot, [
        "diff",
        "--name-only",
        `${config.baseline}..${headSha}`,
      ])?.split("\n").filter(Boolean) ?? [];
    const trapsTouched = config.course.trapPaths.filter((trap) =>
      changed.some((file) => file === trap || file.startsWith(`${trap}/`))
    );

    return {
      armId,
      acceptancePassed: acceptance.passed,
      acceptanceTotal: acceptance.total,
      acceptanceRatio: acceptance.ratio,
      regressionPassed,
      trapsTouched,
      scopeClean: trapsTouched.length === 0,
    };
  } finally {
    disposeScoringCheckout(config, path);
  }
}

export function scoresPath(config: GauntletConfig): string {
  return join(runDir(config.repoRoot, config.runId), SCORES_FILENAME);
}

export function readScores(config: GauntletConfig): ArmScore[] {
  const path = scoresPath(config);
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf-8")) as ArmScore[];
}

export function writeScores(config: GauntletConfig, scores: ArmScore[]): void {
  mkdirSync(runDir(config.repoRoot, config.runId), { recursive: true });
  writeFileSync(
    scoresPath(config),
    `${JSON.stringify(scores, null, 2)}\n`,
    "utf-8"
  );
}

/** Remove any stale scoring worktrees left by an interrupted run. */
export function pruneScoringCheckouts(config: GauntletConfig): void {
  gitQuiet(config.repoRoot, ["worktree", "prune"]);
  const stale = join(tmpdir(), `gauntlet-score-${config.runId}-baseline`);
  if (existsSync(stale)) rmSync(stale, { recursive: true, force: true });
}
