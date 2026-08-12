// Gauntlet — git isolation.
//
// Every arm works in its own worktree, on its own branch, from a pinned
// baseline. There is deliberately no merge helper in this file or anywhere else
// in src/gauntlet; see docs/plans/2026-08-12-model-gauntlet.md Key Decision 10.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { BRANCH_NAMESPACE, GAUNTLET_DIR } from "./config.js";

/** Branches an arm may never be created on, whatever the config says. */
export const PROTECTED_BRANCHES = ["main", "master", "trunk", "develop"];

/** Subdirectory (inside a run dir) holding the per-arm worktrees. */
export const WORKTREES_SUBDIR = "worktrees";

export function git(repoRoot: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

/** Like `git`, but a failure is an expected answer rather than an error — and
 *  stderr is swallowed, so probing for a branch that does not exist yet does
 *  not print `fatal:` into the run log and read as a crash. */
export function gitQuiet(repoRoot: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    }).trim();
  } catch {
    return null;
  }
}

export function resolveSha(repoRoot: string, ref: string): string {
  return git(repoRoot, ["rev-parse", ref]);
}

export function currentBranch(repoRoot: string): string {
  return git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
}

export function isCleanTree(repoRoot: string): boolean {
  return git(repoRoot, ["status", "--porcelain"]).length === 0;
}

/**
 * Reject any branch name that a human would ever merge into, plus anything
 * outside the gauntlet namespace. This is the mechanical half of "nothing
 * merges to main": arms cannot even be *named* something mergeable.
 */
export function assertSafeArmBranch(branch: string): void {
  const leaf = branch.split("/").pop() ?? "";
  if (PROTECTED_BRANCHES.includes(branch) || PROTECTED_BRANCHES.includes(leaf)) {
    throw new Error(
      `Refusing to create arm branch "${branch}": it collides with a protected branch.`
    );
  }
  if (!branch.startsWith(`${BRANCH_NAMESPACE}/`)) {
    throw new Error(
      `Refusing to create arm branch "${branch}": arm branches must live under "${BRANCH_NAMESPACE}/".`
    );
  }
}

export function worktreesRoot(repoRoot: string, runId: string): string {
  return join(resolve(repoRoot), GAUNTLET_DIR, runId, WORKTREES_SUBDIR);
}

export function armWorktreePath(
  repoRoot: string,
  runId: string,
  armId: string
): string {
  return join(worktreesRoot(repoRoot, runId), armId);
}

/**
 * Create (or reuse) an arm's worktree at the pinned baseline.
 * Returns the absolute worktree path.
 */
export function provisionArmWorktree(options: {
  repoRoot: string;
  runId: string;
  armId: string;
  branch: string;
  baseline: string;
  force?: boolean;
}): string {
  const { repoRoot, runId, armId, branch, baseline } = options;
  assertSafeArmBranch(branch);

  const path = armWorktreePath(repoRoot, runId, armId);
  mkdirSync(worktreesRoot(repoRoot, runId), { recursive: true });

  if (existsSync(path)) {
    if (!options.force) return path;
    removeArmWorktree(repoRoot, path);
  }

  const branchExists =
    gitQuiet(repoRoot, ["rev-parse", "--verify", `refs/heads/${branch}`]) !== null;
  const args = branchExists
    ? ["worktree", "add", path, branch]
    : ["worktree", "add", "-b", branch, path, baseline];
  git(repoRoot, args);
  return path;
}

export function removeArmWorktree(repoRoot: string, path: string): void {
  gitQuiet(repoRoot, ["worktree", "remove", "--force", path]);
  if (existsSync(path)) rmSync(path, { recursive: true, force: true });
}

/**
 * Commit whatever the arm left behind. Agents vary in whether they commit their
 * own work; scoring needs a stable ref either way. Returns the head SHA, or
 * null if the arm produced nothing at all.
 */
export function captureArmResult(
  worktreePath: string,
  message: string
): string | null {
  const dirty = git(worktreePath, ["status", "--porcelain"]).length > 0;
  if (dirty) {
    git(worktreePath, ["add", "-A"]);
    git(worktreePath, [
      "-c",
      "user.name=gauntlet",
      "-c",
      "user.email=gauntlet@localhost",
      "commit",
      "--no-verify",
      "-m",
      message,
    ]);
  }
  return gitQuiet(worktreePath, ["rev-parse", "HEAD"]);
}

export interface DiffStat {
  filesChanged: number;
  linesChanged: number;
  paths: string[];
}

/** Diff stats between the pinned baseline and an arm's head. */
export function diffStat(
  repoRoot: string,
  baseline: string,
  head: string
): DiffStat {
  const nameOnly = gitQuiet(repoRoot, [
    "diff",
    "--name-only",
    `${baseline}..${head}`,
  ]);
  const paths = nameOnly ? nameOnly.split("\n").filter(Boolean) : [];
  const numstat = gitQuiet(repoRoot, ["diff", "--numstat", `${baseline}..${head}`]);
  let linesChanged = 0;
  if (numstat) {
    for (const line of numstat.split("\n").filter(Boolean)) {
      const [added, removed] = line.split("\t");
      linesChanged += toCount(added) + toCount(removed);
    }
  }
  return { filesChanged: paths.length, linesChanged, paths };
}

/** Binary files report "-" in numstat; count them as zero lines, not NaN. */
function toCount(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Full unified diff between baseline and head, restricted to given paths. */
export function diffText(
  repoRoot: string,
  baseline: string,
  head: string,
  pathspecs: string[] = []
): string {
  const args = [
    "diff",
    "--no-color",
    "--no-renames",
    `${baseline}..${head}`,
  ];
  if (pathspecs.length > 0) args.push("--", ...pathspecs);
  return gitQuiet(repoRoot, args) ?? "";
}

/**
 * Preflight the repo before a run: clean tree, resolvable baseline, and a
 * .gitignore entry so gauntlet state never lands in the project's own history.
 */
export function preflightRepo(repoRoot: string, baselineRef: string): {
  baseline: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  if (gitQuiet(repoRoot, ["rev-parse", "--git-dir"]) === null) {
    throw new Error(`${repoRoot} is not a git repository.`);
  }
  if (!isCleanTree(repoRoot)) {
    throw new Error(
      "Working tree is dirty. A gauntlet pins a baseline commit; uncommitted changes would silently differ between arms."
    );
  }
  const baseline = resolveSha(repoRoot, baselineRef);
  const ignorePath = join(resolve(repoRoot), ".gitignore");
  if (!existsSync(ignorePath)) {
    warnings.push(`No .gitignore — add "${GAUNTLET_DIR}/" before committing.`);
  }
  return { baseline, warnings };
}
