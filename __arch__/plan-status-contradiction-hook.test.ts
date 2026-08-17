// Stop-hook plan-status contradiction message — behavioral regression tests.
//
// The bug this guards against: the Stop backstop used to compare ONLY
// frontmatter `status:` against `git merge-base` and, on a merged branch,
// told the agent "Fix the status now (status: done)" as an imperative — even
// when the plan's own body still listed unresolved work in prose (PENDING,
// BLOCKED, numbered IN PROGRESS lines) or unchecked boxes. A merged branch
// means the CODE is live; it does not mean the PLAN's own body agrees the
// work is finished. Downstream agents (including a different model reasoning
// from the transcript) took the imperative at face value and flipped the
// status on a genuinely unfinished plan.
//
// Contract under test (see buildStopScript / PLAN_OPEN_ITEM_GREP in
// src/hooks.ts):
// - merged branch, plan body has NO open-item markers
//     -> "PLAN STATUS CONTRADICTION" (the command: "Fix the status now")
// - merged branch, plan body HAS an open-item marker (box / PENDING /
//   BLOCKED / IN PROGRESS)
//     -> "PLAN STATUS CHECK" (a prompt: "read the ... sections", never a
//        direct command to set status: done)
// - branch NOT merged -> neither message fires
// - the two message classes are mutually exclusive per plan (never both)

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildStopScript } from "../src/hooks";

const STOP_CMD = buildStopScript({ stack: {} } as any);

function runStop(cwd: string) {
  const result = spawnSync("sh", ["-c", STOP_CMD], {
    cwd,
    env: { ...process.env },
    encoding: "utf8",
    timeout: 15_000,
  });
  return { status: result.status, stdout: result.stdout ?? "" };
}

/** Merge a fresh branch (one commit) into main so it counts as "live". */
function mergeFeatureBranch(repo: string, branch: string, file: string) {
  execSync(`git checkout -q -b ${branch}`, { cwd: repo });
  writeFileSync(join(repo, file), "x");
  execSync(`git add -A && git commit -q -m ${branch}`, { cwd: repo });
  execSync("git checkout -q main", { cwd: repo });
  execSync(`git merge -q --no-ff ${branch} -m "merge ${branch}"`, { cwd: repo });
}

let repo: string;

beforeAll(() => {
  repo = realpathSync(mkdtempSync(join(tmpdir(), "soloship-stop-pc-")));
  execSync("git init -q -b main", { cwd: repo });
  execSync("git commit -q --allow-empty -m base", { cwd: repo });
  mkdirSync(join(repo, "docs", "plans"), { recursive: true });
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("Stop-hook plan-status contradiction message", () => {
  it("MUST FIRE: merged branch, no open-item markers -> HARD contradiction (a command)", () => {
    mergeFeatureBranch(repo, "feat-hard", "hard.txt");
    const plan = join(repo, "docs", "plans", "2026-08-16-hard.md");
    try {
      writeFileSync(
        plan,
        "---\nstatus: in-progress\nbranch: feat-hard\n---\n## Done-When\n- [x] everything shipped, forgot to flip status\n"
      );

      const { stdout } = runStop(repo);
      expect(stdout).toContain("PLAN STATUS CONTRADICTION");
      expect(stdout).toContain("Fix the status now (status: done)");
      expect(stdout).not.toContain("PLAN STATUS CHECK");
    } finally {
      rmSync(plan, { force: true });
    }
  });

  it("MUST FIRE: merged branch, plan body still has an unchecked box -> SOFT prompt, never a command", () => {
    mergeFeatureBranch(repo, "feat-soft-box", "soft-box.txt");
    const plan = join(repo, "docs", "plans", "2026-08-16-soft-box.md");
    try {
      writeFileSync(
        plan,
        "---\nstatus: in-progress\nbranch: feat-soft-box\n---\n## QA Plan\n- [ ] verify in prod\n"
      );

      const { stdout } = runStop(repo);
      expect(stdout).toContain("PLAN STATUS CHECK");
      expect(stdout).toContain("Cutover/QA Plan/Done-When");
      expect(stdout).not.toContain("Fix the status now (status: done)");
      expect(stdout).not.toContain("PLAN STATUS CONTRADICTION —");
    } finally {
      rmSync(plan, { force: true });
    }
  });

  it("MUST FIRE: merged branch, plan body has a numbered IN PROGRESS line -> SOFT prompt", () => {
    mergeFeatureBranch(repo, "feat-soft-prose", "soft-prose.txt");
    const plan = join(repo, "docs", "plans", "2026-08-16-soft-prose.md");
    try {
      writeFileSync(
        plan,
        "---\nstatus: in-progress\nbranch: feat-soft-prose\n---\n## Cutover\n3. IN PROGRESS: watch rollout metrics\n"
      );

      const { stdout } = runStop(repo);
      expect(stdout).toContain("PLAN STATUS CHECK");
      expect(stdout).not.toContain("Fix the status now (status: done)");
    } finally {
      rmSync(plan, { force: true });
    }
  });

  it("MUST FIRE: merged branch, plan body has a PENDING marker -> SOFT prompt", () => {
    mergeFeatureBranch(repo, "feat-soft-pending", "soft-pending.txt");
    const plan = join(repo, "docs", "plans", "2026-08-16-soft-pending.md");
    try {
      writeFileSync(
        plan,
        "---\nstatus: planned\nbranch: feat-soft-pending\n---\n## Cutover\nPENDING: DNS cutover\n"
      );

      const { stdout } = runStop(repo);
      expect(stdout).toContain("PLAN STATUS CHECK");
    } finally {
      rmSync(plan, { force: true });
    }
  });

  it("does not fire (neither message) when the plan's branch is not merged", () => {
    // Diverge from main with a commit that stays ONLY on the branch — a
    // branch created but never advanced has the same tip as main, which
    // `git merge-base --is-ancestor` correctly (if confusingly) treats as
    // already merged. A real "not merged yet" branch has to actually differ.
    execSync("git checkout -q -b feat-unmerged", { cwd: repo });
    writeFileSync(join(repo, "unmerged-only.txt"), "x");
    execSync("git add -A && git commit -q -m feat-unmerged-commit", { cwd: repo });
    execSync("git checkout -q main", { cwd: repo });
    const plan = join(repo, "docs", "plans", "2026-08-16-unmerged.md");
    try {
      writeFileSync(
        plan,
        "---\nstatus: in-progress\nbranch: feat-unmerged\n---\n## Done-When\n- [ ] not shipped\n"
      );

      const { stdout } = runStop(repo);
      expect(stdout).not.toContain("PLAN STATUS CONTRADICTION");
      expect(stdout).not.toContain("PLAN STATUS CHECK");
    } finally {
      rmSync(plan, { force: true });
    }
  });

  it("does not fire for a plan already correctly marked status: done", () => {
    mergeFeatureBranch(repo, "feat-already-done", "already-done.txt");
    const plan = join(repo, "docs", "plans", "2026-08-16-already-done.md");
    try {
      writeFileSync(
        plan,
        "---\nstatus: done\nbranch: feat-already-done\n---\n## Done-When\n- [x] shipped\n"
      );

      const { stdout } = runStop(repo);
      expect(stdout).not.toContain("PLAN STATUS CONTRADICTION");
      expect(stdout).not.toContain("PLAN STATUS CHECK");
    } finally {
      rmSync(plan, { force: true });
    }
  });
});
