// Committed cross-host gates — behavioral regression tests.
//
// Exercises the GENERATED .cjs files end-to-end via child_process, exactly as
// Claude Code / Codex / Cursor / Antigravity would invoke them: the real
// payload shape for each host piped on stdin, no env vars. Ported from the
// bash builders in src/hooks.ts (see committed-gates.ts header for why) —
// these tests are the must-fire fixtures the port's correctness rests on,
// per the src/AGENTS.md pitfall on fail-safe hooks: a unit test of the
// builder's output string cannot catch a mis-ported regex or field name;
// only executing the generated script against a realistic payload can.
//
// Contract under test (see committed-gates.ts):
// - claude/codex payload: {hook_event_name, tool_name, tool_input, session_id, cwd}
//     -> block: exit 2 + message on stderr
//     -> warn (non-blocking): exit 0 + {systemMessage} JSON on stdout
//     -> allow: exit 0, empty stdout
// - cursor payload: {command, cwd, conversation_id} (no tool_input wrapper)
//     -> block: exit 0 + {permission:"deny", ...} JSON
//     -> allow: exit 0 + {permission:"allow"} JSON
// - antigravity payload: {toolCall:{name, args}}
//     -> block: exit 0 + {decision:"deny", reason} JSON
//     -> allow: exit 0 + {decision:"allow"} JSON

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeCommittedGateFiles, portableGateInvocation, GATE_NAMES } from "../src/committed-gates";
import { installCodexHooks, installAntigravityHooks } from "../src/hooks";

let dir: string;
let gateDir: string;

beforeAll(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "soloship-cgates-")));
  execSync("git init -q -b main", { cwd: dir });
  execSync('git config user.email "test@example.com"', { cwd: dir });
  execSync('git config user.name "Test"', { cwd: dir });
  execSync("git commit -q --allow-empty -m base", { cwd: dir });
  writeCommittedGateFiles(dir);
  gateDir = join(dir, "scripts", "soloship-hooks");
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function run(gate: string, payload: string, cwd: string = dir) {
  const result = spawnSync("node", [join(gateDir, `${gate}.cjs`)], {
    cwd,
    input: payload,
    encoding: "utf8",
    timeout: 10_000,
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

const claudePayload = (toolName: string, toolInput: Record<string, unknown>) =>
  JSON.stringify({ hook_event_name: "PreToolUse", tool_name: toolName, tool_input: toolInput, session_id: "s1" });
const cursorCommandPayload = (command: string) => JSON.stringify({ command, conversation_id: "c1" });
const antigravityCommandPayload = (commandLine: string) =>
  JSON.stringify({ toolCall: { name: "run_command", args: { CommandLine: commandLine } } });

describe("committed gate: command-safety", () => {
  it("MUST FIRE: blocks cat .env (claude/codex shape)", () => {
    const { status, stderr } = run("command-safety", claudePayload("Bash", { command: "cat .env" }));
    expect(status).toBe(2);
    expect(stderr).toContain("BLOCKED");
  });

  it("MUST FIRE: blocks cat .env (cursor shape)", () => {
    const { status, stdout } = run("command-safety", cursorCommandPayload("cat .env"));
    expect(status).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ permission: "deny" });
  });

  it("MUST FIRE: blocks rm -rf ~ (antigravity shape)", () => {
    const { status, stdout } = run("command-safety", antigravityCommandPayload("rm -rf ~"));
    expect(status).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ decision: "deny" });
  });

  it("MUST FIRE: blocks force push to main", () => {
    const { status } = run("command-safety", claudePayload("Bash", { command: "git push origin main --force" }));
    expect(status).toBe(2);
  });

  it("MUST FIRE: blocks a hardcoded API key", () => {
    const { status } = run(
      "command-safety",
      claudePayload("Bash", { command: 'export STRIPE_SECRET_KEY="sk_live_abcdefghijklmnopqrst"' })
    );
    expect(status).toBe(2);
  });

  it("passes: allows an ordinary command", () => {
    const { status, stdout, stderr } = run("command-safety", claudePayload("Bash", { command: "ls -la" }));
    expect(status).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toBe("");
  });

  it("fails safe with an empty stdin payload", () => {
    const { status } = run("command-safety", "");
    expect(status).toBe(0);
  });
});

describe("committed gate: billing-confirmation", () => {
  it("MUST FIRE: blocks a write to billing.ts", () => {
    const { status, stderr } = run(
      "billing-confirmation",
      claudePayload("Write", { file_path: "billing.ts", content: "x" })
    );
    expect(status).toBe(2);
    expect(stderr).toContain("billing-confirmation-gate");
  });

  it("MUST FIRE: blocks content matching credit-balance identifiers even off-path", () => {
    const { status } = run(
      "billing-confirmation",
      claudePayload("Write", { file_path: "unrelated.ts", content: "creditBalance -= 5" })
    );
    expect(status).toBe(2);
  });

  it("passes: allows once .ai/.billing-ack exists", () => {
    mkdirSync(join(dir, ".ai"), { recursive: true });
    writeFileSync(join(dir, ".ai", ".billing-ack"), "confirmed: test\n");
    try {
      const { status } = run("billing-confirmation", claudePayload("Write", { file_path: "billing.ts", content: "x" }));
      expect(status).toBe(0);
    } finally {
      rmSync(join(dir, ".ai", ".billing-ack"));
    }
  });

  it("passes: an unrelated file/content", () => {
    const { status } = run(
      "billing-confirmation",
      claudePayload("Write", { file_path: "README.md", content: "hello" })
    );
    expect(status).toBe(0);
  });
});

describe("committed gate: deploy-discipline", () => {
  let branchDir: string;

  beforeAll(() => {
    branchDir = join(dir, "deploy-discipline-fixture");
  });

  it("MUST FIRE: blocks a production deploy from a non-default branch", () => {
    execSync("git checkout -q -b feat/x", { cwd: dir });
    try {
      const { status, stderr } = run("deploy-discipline", claudePayload("Bash", { command: "npm run deploy" }));
      expect(status).toBe(2);
      expect(stderr).toContain("deploy-from-main-only");
    } finally {
      execSync("git checkout -q main", { cwd: dir });
      execSync("git branch -D feat/x", { cwd: dir });
    }
  });

  it("passes: preview deploy allowed from a non-default branch", () => {
    execSync("git checkout -q -b feat/y", { cwd: dir });
    try {
      const { status } = run("deploy-discipline", claudePayload("Bash", { command: "wrangler pages deploy --branch preview" }));
      expect(status).toBe(0);
    } finally {
      execSync("git checkout -q main", { cwd: dir });
      execSync("git branch -D feat/y", { cwd: dir });
    }
  });

  it("passes: a non-deploy command", () => {
    const { status } = run("deploy-discipline", claudePayload("Bash", { command: "npm test" }));
    expect(status).toBe(0);
  });
});

describe("committed gate: recurrence", () => {
  let recDir: string;

  beforeAll(() => {
    recDir = realpathSync(mkdtempSync(join(tmpdir(), "soloship-cgates-rec-")));
    execSync("git init -q -b main", { cwd: recDir });
    execSync('git config user.email "test@example.com"', { cwd: recDir });
    execSync('git config user.name "Test"', { cwd: recDir });
    mkdirSync(join(recDir, ".ai"), { recursive: true });
    writeFileSync(
      join(recDir, ".ai", "learnings.jsonl"),
      JSON.stringify({
        date: "2026-01-01",
        key: "stale-cache-bug",
        insight: "cache invalidation missing on webhook update",
        solution: "added cache.invalidate() call",
        components: ["webhook", "cache"],
      }) + "\n"
    );
    writeFileSync(join(recDir, "webhook.ts"), "// fix\n");
    execSync("git add -A && git commit -q -m init", { cwd: recDir });
    writeFileSync(join(recDir, "webhook.ts"), "// fix again\n");
    execSync("git add webhook.ts", { cwd: recDir });
  });

  afterAll(() => {
    rmSync(recDir, { recursive: true, force: true });
  });

  it("MUST FIRE: blocks first recurrence on file + message-token match", () => {
    const { status, stderr } = run(
      "recurrence",
      claudePayload("Bash", { command: 'git commit -m "fix webhook cache invalidation issue again"' }),
      recDir
    );
    expect(status).toBe(2);
    expect(stderr).toContain("recurrence-gate");
  });

  it("passes: allows an unrelated commit message", () => {
    const { status } = run(
      "recurrence",
      claudePayload("Bash", { command: 'git commit -m "add totally unrelated feature"' }),
      recDir
    );
    expect(status).toBe(0);
  });

  it("passes: allows a non-commit command", () => {
    const { status } = run("recurrence", claudePayload("Bash", { command: "git status" }), recDir);
    expect(status).toBe(0);
  });
});

describe("committed gate: plan-truth / plan-namespace / plan-merge", () => {
  let planDir: string;

  beforeAll(() => {
    planDir = realpathSync(mkdtempSync(join(tmpdir(), "soloship-cgates-plan-")));
    execSync("git init -q -b main", { cwd: planDir });
    execSync('git config user.email "test@example.com"', { cwd: planDir });
    execSync('git config user.name "Test"', { cwd: planDir });
    execSync("git commit -q --allow-empty -m base", { cwd: planDir });
    mkdirSync(join(planDir, "docs", "plans"), { recursive: true });
    writeFileSync(
      join(planDir, "docs", "plans", "2026-01-01-test.md"),
      "---\nstatus: planned\nbranch: feat/test\n---\n# test\n"
    );
    execSync("git add docs/plans/2026-01-01-test.md && git commit -q -m plan", { cwd: planDir });
    execSync("git checkout -q -b feat/test", { cwd: planDir });
    writeFileSync(join(planDir, "app.ts"), "code\n");
    execSync("git add app.ts", { cwd: planDir });
  });

  afterAll(() => {
    rmSync(planDir, { recursive: true, force: true });
  });

  it("MUST FIRE: plan-truth blocks a code commit while the plan says planned", () => {
    const { status, stderr } = run("plan-truth", claudePayload("Bash", { command: 'git commit -m "wip"' }), planDir);
    expect(status).toBe(2);
    expect(stderr).toContain("plan-truth-gate");
  });

  it("passes: plan-truth allows a docs-only commit", () => {
    execSync("git reset -q", { cwd: planDir });
    execSync("git add docs/plans/2026-01-01-test.md", { cwd: planDir });
    const { status } = run("plan-truth", claudePayload("Bash", { command: 'git commit -m "plan update"' }), planDir);
    expect(status).toBe(0);
  });

  it("MUST FIRE: plan-namespace blocks a statusless write under docs/plans/", () => {
    const { status, stderr } = run(
      "plan-namespace",
      claudePayload("Write", { file_path: "docs/plans/2026-01-02-bad.md", content: "# no status" }),
      planDir
    );
    expect(status).toBe(2);
    expect(stderr).toContain("plan-namespace-gate");
  });

  it("passes: plan-namespace allows a write that declares a valid status", () => {
    const { status } = run(
      "plan-namespace",
      claudePayload("Write", { file_path: "docs/plans/2026-01-02-good.md", content: "---\nstatus: planned\n---\n" }),
      planDir
    );
    expect(status).toBe(0);
  });

  it("MUST FIRE: plan-merge blocks merging a branch whose plan is still open", () => {
    execSync("git checkout -q main", { cwd: planDir });
    const { status, stderr } = run(
      "plan-merge",
      claudePayload("Bash", { command: "git merge feat/test -m merge" }),
      planDir
    );
    expect(status).toBe(2);
    expect(stderr).toContain("plan-merge-gate");
  });

  it("passes: plan-merge allows merging an unrelated branch", () => {
    const { status } = run(
      "plan-merge",
      claudePayload("Bash", { command: "git merge some-other-branch -m merge" }),
      planDir
    );
    expect(status).toBe(0);
  });
});

describe("committed gate: deploy-freshness", () => {
  let freshDir: string;

  beforeAll(() => {
    freshDir = realpathSync(mkdtempSync(join(tmpdir(), "soloship-cgates-fresh-")));
    mkdirSync(join(freshDir, "dist"), { recursive: true });
    mkdirSync(join(freshDir, "src"), { recursive: true });
    writeFileSync(join(freshDir, "package.json"), JSON.stringify({ scripts: { build: "true", deploy: "wrangler deploy" } }));
    writeFileSync(join(freshDir, "dist", "bundle.js"), "old");
  });

  afterAll(() => {
    rmSync(freshDir, { recursive: true, force: true });
  });

  it("MUST FIRE: blocks a deploy command when source is newer than the artifact", async () => {
    await new Promise((r) => setTimeout(r, 1100));
    writeFileSync(join(freshDir, "src", "app.ts"), "new");
    const { status, stderr } = run("deploy-freshness", claudePayload("Bash", { command: "wrangler deploy" }), freshDir);
    expect(status).toBe(2);
    expect(stderr).toContain("BLOCKED");
  });

  it("passes: allows when the deploy command itself runs a build", () => {
    const { status } = run("deploy-freshness", claudePayload("Bash", { command: "npm run build && wrangler deploy" }), freshDir);
    expect(status).toBe(0);
  });

  it("passes: a non-deploy command", () => {
    const { status } = run("deploy-freshness", claudePayload("Bash", { command: "npm test" }), freshDir);
    expect(status).toBe(0);
  });
});

describe("gate directory portability", () => {
  it("REGRESSION: scripts/soloship-hooks/ is never gitignored by this repo's own root .gitignore (the .soloship/ directory move was fixed 2026-08-27 for exactly this)", () => {
    // Guards the actual incident: Soloship's own repo has a blanket
    // `.soloship/` line in its root .gitignore, predating this plan. The
    // first cut of this feature wrote gates to `.soloship/hooks/`, which
    // that rule silently swallowed — a gate that installs but never reaches
    // a clone. This asserts against dist output (the real installer path),
    // not just the fixture repos above, which start with no .gitignore at
    // all and would never have caught it.
    const repoRoot = realpathSync(join(__dirname, ".."));
    const result = execSync("git check-ignore -q scripts/soloship-hooks/_probe.cjs; echo $?", {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    expect(result).toBe("1"); // 1 = NOT ignored
  });

  it("throws instead of silently installing into a gitignored gate directory", () => {
    const ignoredDir = realpathSync(mkdtempSync(join(tmpdir(), "soloship-cgates-ignored-")));
    try {
      execSync("git init -q -b main", { cwd: ignoredDir });
      execSync('git config user.email "test@example.com"', { cwd: ignoredDir });
      execSync('git config user.name "Test"', { cwd: ignoredDir });
      writeFileSync(join(ignoredDir, ".gitignore"), "scripts/\n");
      execSync("git add -A && git commit -q -m base", { cwd: ignoredDir });

      expect(() => writeCommittedGateFiles(ignoredDir)).toThrow(/gitignore/i);
    } finally {
      rmSync(ignoredDir, { recursive: true, force: true });
    }
  });
});

describe("Codex and Antigravity configs use portable (non-absolute) paths", () => {
  let portDir: string;

  beforeAll(async () => {
    portDir = realpathSync(mkdtempSync(join(tmpdir(), "soloship-cgates-portable-")));
    execSync("git init -q -b main", { cwd: portDir });
    execSync('git config user.email "test@example.com"', { cwd: portDir });
    execSync('git config user.name "Test"', { cwd: portDir });
    execSync("git commit -q --allow-empty -m base", { cwd: portDir });
    await installCodexHooks(portDir, {} as any);
    await installAntigravityHooks(portDir, {} as any);
  });

  afterAll(() => {
    rmSync(portDir, { recursive: true, force: true });
  });

  it("portableGateInvocation never bakes an absolute path", () => {
    for (const name of GATE_NAMES) {
      const cmd = portableGateInvocation(name);
      expect(cmd).not.toContain(portDir);
      expect(cmd).toContain("$(git rev-parse --show-toplevel)");
    }
  });

  it(".codex/hooks.json contains no absolute path", () => {
    const body = readFileSync(join(portDir, ".codex", "hooks.json"), "utf8");
    expect(body).not.toContain(portDir);
  });

  it(".agents/hooks.json contains no absolute path", () => {
    const body = readFileSync(join(portDir, ".agents", "hooks.json"), "utf8");
    expect(body).not.toContain(portDir);
  });

  it("the Codex adapter command still resolves and blocks when invoked from a subdirectory", () => {
    mkdirSync(join(portDir, "sub"), { recursive: true });
    const cfg = JSON.parse(readFileSync(join(portDir, ".codex", "hooks.json"), "utf8"));
    const billingEntry = cfg.hooks.PreToolUse.find((e: any) =>
      e.hooks[0].command.includes("billing-confirmation")
    );
    const result = spawnSync("sh", ["-c", billingEntry.hooks[0].command], {
      cwd: join(portDir, "sub"),
      input: JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "Write",
        tool_input: { file_path: "billing.ts", content: "x" },
        session_id: "s1",
      }),
      encoding: "utf8",
    });
    expect(result.status).toBe(2);
  });
});
