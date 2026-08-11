// Main-checkout authoring warn hook — behavioral regression tests.
//
// Exercises the GENERATED hook script end-to-end via child_process using the
// real input contract ($HOOK_TOOL_INPUT env var, the same contract the
// plan-merge gate uses). The hook is fail-safe by design (exit 0 on any
// internal error), so MUST-FIRE positive fixtures are the load-bearing part:
// without them a dead detection regex reads as "nothing to report".
//
// Contract under test (see buildMainCheckoutAuthorWarnScript in src/hooks.ts):
// - git commit, in the main checkout, sibling worktrees active
//     -> exit 0 (warn, NEVER block) + systemMessage JSON on stdout
// - git commit, main checkout, NO other worktrees -> exit 0, silent
// - git commit, inside a worktree                 -> exit 0, silent
// - git merge (not an authoring command)          -> exit 0, silent
// - outside a git repo / empty input              -> exit 0, silent

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildMainCheckoutAuthorWarnScript } from "../src/hooks";

const HOOK_CMD = buildMainCheckoutAuthorWarnScript();

/** Run the generated hook command exactly as Claude Code would. */
function runHook(toolInput: string, cwd: string) {
  const result = spawnSync("sh", ["-c", HOOK_CMD], {
    cwd,
    env: { ...process.env, HOOK_TOOL_INPUT: toolInput },
    encoding: "utf8",
    timeout: 10_000,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

let mainRepo: string;
let worktree: string;
let soloRepo: string;

beforeAll(() => {
  // Repo WITH a sibling worktree (the must-fire environment).
  mainRepo = realpathSync(mkdtempSync(join(tmpdir(), "soloship-mcw-main-")));
  execSync("git init -q -b main", { cwd: mainRepo });
  execSync("git commit -q --allow-empty -m base", { cwd: mainRepo });
  worktree = join(mainRepo, ".worktrees", "feat-x");
  execSync(`git worktree add -q -b feat-x "${worktree}"`, { cwd: mainRepo });

  // Repo with NO worktrees (nobody to collide with).
  soloRepo = realpathSync(mkdtempSync(join(tmpdir(), "soloship-mcw-solo-")));
  execSync("git init -q -b main", { cwd: soloRepo });
  execSync("git commit -q --allow-empty -m base", { cwd: soloRepo });
});

afterAll(() => {
  rmSync(mainRepo, { recursive: true, force: true });
  rmSync(soloRepo, { recursive: true, force: true });
});

describe("main-checkout authoring warn hook", () => {
  it("MUST FIRE: git commit in the main checkout with worktrees active -> exit 0 + warning", () => {
    const { status, stdout } = runHook('git commit -m "quick fix"', mainRepo);
    expect(status).toBe(0); // warn-only: the commit must proceed
    expect(stdout).toContain("main-checkout-authoring");
    expect(stdout).toContain("systemMessage");
    expect(stdout).toContain("merge-sequence.md");
  });

  it("MUST FIRE: fires for compound commands containing git commit", () => {
    const { status, stdout } = runHook(
      'git add -A && git commit -m "batch"',
      mainRepo
    );
    expect(status).toBe(0);
    expect(stdout).toContain("main-checkout-authoring");
  });

  it("names the active worktrees in the warning", () => {
    const { stdout } = runHook('git commit -m x', mainRepo);
    expect(stdout).toContain("feat-x");
  });

  it("stays silent in the main checkout when NO other worktrees exist", () => {
    const { status, stdout } = runHook('git commit -m x', soloRepo);
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("stays silent when committing INSIDE a worktree (that is the remedy)", () => {
    const { status, stdout } = runHook('git commit -m x', worktree);
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("stays silent for git merge (the station's legitimate job, not authoring)", () => {
    const { status, stdout } = runHook(
      'git merge --no-ff feat-x -m "Merge feat-x"',
      mainRepo
    );
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("stays silent for non-git commands", () => {
    const { status, stdout } = runHook("npm test", mainRepo);
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("fails safe (silent exit 0) outside a git repository", () => {
    const bare = mkdtempSync(join(tmpdir(), "soloship-mcw-nogit-"));
    try {
      const { status, stdout } = runHook('git commit -m x', bare);
      expect(status).toBe(0);
      expect(stdout).toBe("");
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it("fails safe with empty HOOK_TOOL_INPUT", () => {
    const { status, stdout } = runHook("", mainRepo);
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });
});
