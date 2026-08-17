// Plan-done-checklist gate — behavioral regression tests.
//
// Exercises the GENERATED hook script end-to-end via child_process using the
// real input contract ($HOOK_TOOL_INPUT env var — the same contract every
// other PreToolUse gate uses). BLOCK-by-design, so MUST-FIRE positive
// fixtures are the load-bearing part: without them a dead detection regex
// reads as "nothing to report".
//
// Contract under test (see buildPlanDoneChecklistGateScript in src/hooks.ts):
// - Write setting status: done, payload still has an open-item marker
//     -> BLOCKED (exit 2), stderr names the file and the fix
// - Write setting status: done, payload fully resolved -> exit 0, silent
// - Edit setting status: done, ON-DISK body still has an open-item marker
//     -> BLOCKED (exit 2) (payload alone can't prove the merged body is clean)
// - Edit setting status: done, on-disk body fully resolved -> exit 0, silent
// - Edit that does not touch status at all -> exit 0, silent (never fires)
// - Any write NOT setting status: done -> exit 0, silent
// - Write into docs/plans/archive/ or docs/plans/README.md -> exempt
// - Write outside docs/plans/*.md entirely -> exit 0, silent
// - .ai/.plan-status-ack present -> stands down entirely
// - empty $HOOK_TOOL_INPUT -> fails safe, exit 0, silent

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildPlanDoneChecklistGateScript } from "../src/hooks";

const HOOK_CMD = buildPlanDoneChecklistGateScript();

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

function writeTI(filePath: string, content: string): string {
  return JSON.stringify({ file_path: filePath, content });
}

function editTI(filePath: string, oldString: string, newString: string): string {
  return JSON.stringify({ file_path: filePath, old_string: oldString, new_string: newString });
}

let dir: string;
let plan: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "soloship-pdcg-")));
  mkdirSync(join(dir, "docs", "plans"), { recursive: true });
  plan = join(dir, "docs", "plans", "2026-08-16-foo.md");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("plan-done-checklist gate", () => {
  it("MUST FIRE: Write -> status: done with an unchecked box still in the payload", () => {
    writeFileSync(
      plan,
      "---\nstatus: in-progress\n---\n## Done-When\n- [ ] thing one\n- [x] thing two\n"
    );
    const ti = writeTI(
      plan,
      "---\nstatus: done\n---\n## Done-When\n- [ ] thing one\n- [x] thing two\n"
    );
    const { status, stderr } = runHook(ti, dir);
    expect(status).toBe(2);
    expect(stderr).toContain("BLOCKED by plan-done-checklist-gate");
    expect(stderr).toContain(plan);
    expect(stderr).toContain(".ai/.plan-status-ack");
  });

  it("MUST FIRE: Write -> status: done with a PENDING marker in the payload", () => {
    const ti = writeTI(
      plan,
      "---\nstatus: done\n---\n## Cutover\n3. PENDING: flip DNS\n"
    );
    const { status } = runHook(ti, dir);
    expect(status).toBe(2);
  });

  it("MUST FIRE: Edit -> status: done while the ON-DISK body still has an open box", () => {
    writeFileSync(
      plan,
      "---\nstatus: in-progress\n---\n## Done-When\n- [ ] thing one\n- [x] thing two\n"
    );
    const ti = editTI(plan, "status: in-progress", "status: done");
    const { status, stderr } = runHook(ti, dir);
    expect(status).toBe(2);
    expect(stderr).toContain("BLOCKED by plan-done-checklist-gate");
  });

  it("passes: Write -> status: done with every box checked in the payload", () => {
    writeFileSync(
      plan,
      "---\nstatus: in-progress\n---\n## Done-When\n- [ ] thing one\n"
    );
    const ti = writeTI(
      plan,
      "---\nstatus: done\n---\n## Done-When\n- [x] thing one\n- [x] thing two\n"
    );
    const { status, stderr } = runHook(ti, dir);
    expect(status).toBe(0);
    expect(stderr).toBe("");
  });

  it("passes: Edit -> status: done once the on-disk body is fully resolved", () => {
    writeFileSync(
      plan,
      "---\nstatus: in-progress\n---\n## Done-When\n- [x] thing one\n- [x] thing two\n"
    );
    const ti = editTI(plan, "status: in-progress", "status: done");
    const { status, stderr } = runHook(ti, dir);
    expect(status).toBe(0);
    expect(stderr).toBe("");
  });

  it("passes: Edit that does not touch status at all, even with open items on disk", () => {
    writeFileSync(
      plan,
      "---\nstatus: in-progress\n---\n## Done-When\n- [ ] thing one\n"
    );
    const ti = editTI(plan, "thing one", "thing one, updated wording");
    const { status, stderr } = runHook(ti, dir);
    expect(status).toBe(0);
    expect(stderr).toBe("");
  });

  it("passes: a write that does not set status: done at all", () => {
    const ti = writeTI(plan, "---\nstatus: in-progress\n---\n- [ ] thing one\n");
    const { status } = runHook(ti, dir);
    expect(status).toBe(0);
  });

  it("stays silent for a write into docs/plans/archive/", () => {
    const archived = join(dir, "docs", "plans", "archive", "old.md");
    mkdirSync(join(dir, "docs", "plans", "archive"), { recursive: true });
    const ti = writeTI(archived, "---\nstatus: done\n---\n- [ ] x\n");
    const { status, stderr } = runHook(ti, dir);
    expect(status).toBe(0);
    expect(stderr).toBe("");
  });

  it("stays silent for docs/plans/README.md", () => {
    const readme = join(dir, "docs", "plans", "README.md");
    const ti = writeTI(readme, "status: done\n- [ ] x\n");
    const { status } = runHook(ti, dir);
    expect(status).toBe(0);
  });

  it("stays silent for a file outside docs/plans/", () => {
    const other = join(dir, "notes.md");
    const ti = writeTI(other, "---\nstatus: done\n---\n- [ ] x\n");
    const { status } = runHook(ti, dir);
    expect(status).toBe(0);
  });

  it("stands down entirely when .ai/.plan-status-ack is present", () => {
    writeFileSync(
      plan,
      "---\nstatus: in-progress\n---\n## Done-When\n- [ ] thing one\n"
    );
    mkdirSync(join(dir, ".ai"), { recursive: true });
    writeFileSync(join(dir, ".ai", ".plan-status-ack"), "reason: testing\n");
    const ti = writeTI(
      plan,
      "---\nstatus: done\n---\n## Done-When\n- [ ] thing one\n"
    );
    const { status, stderr } = runHook(ti, dir);
    expect(status).toBe(0);
    expect(stderr).toBe("");
  });

  it("fails safe with empty HOOK_TOOL_INPUT", () => {
    const { status, stderr } = runHook("", dir);
    expect(status).toBe(0);
    expect(stderr).toBe("");
  });
});
