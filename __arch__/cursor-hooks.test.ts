// Cursor-native hook scripts — behavioral regression tests.
//
// Why these exist: Cursor fails OPEN on a hook that crashes, so a generated
// script with a syntax error protects nothing while `soloship doctor` reports
// it installed. That exact defect happened twice while these were built — a
// "/" inside an interpolated regex LITERAL (as in `/Users`) terminates the
// literal early and the whole script fails to parse. The parse test below is
// the mechanical floor for that class; the behavioral tests are the floor for
// the gates themselves.
//
// Contract under test (verified against https://cursor.com/docs/hooks,
// 2026-08-18):
// - input arrives as JSON on stdin (NOT $HOOK_TOOL_INPUT, a Claude Code-ism)
// - permission hooks answer {"permission":"allow"|"deny"} on stdout
// - the stop hook answers {"followup_message": "..."} or {}
// - anything unparseable fails OPEN — a gate that bricks the agent gets
//   deleted, and then it guards nothing at all

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Script } from "node:vm";
import {
  installCursorHooks,
  buildCursorCommandSafetyScript,
  buildCursorFileProtectionScript,
  buildCursorPlanTruthScript,
} from "../src/hooks";

const SCRIPTS: Record<string, string> = {
  "command-safety": buildCursorCommandSafetyScript(),
  "file-protection": buildCursorFileProtectionScript(),
  "plan-truth": buildCursorPlanTruthScript(),
};

function runScript(body: string, payload: string, cwd?: string) {
  const dir = mkdtempSync(join(tmpdir(), "soloship-cursor-hook-"));
  // `.cjs`, matching what the installer writes. Under `.js` in a project whose
  // package.json says `"type": "module"`, require() throws and the scripts'
  // own error handling turns the crash into a cheerful "allow".
  const path = join(dir, "hook.cjs");
  writeFileSync(path, body);
  try {
    const result = spawnSync(process.execPath, [path], {
      input: payload,
      cwd: cwd || dir,
      encoding: "utf8",
      timeout: 15_000,
    });
    return {
      status: result.status,
      stdout: (result.stdout || "").trim(),
      stderr: (result.stderr || "").trim(),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const shell = (command: string) => JSON.stringify({ command, cwd: "/p" });
const write = (file_path: string, content?: string) =>
  JSON.stringify({
    tool_name: "Write",
    tool_input: content === undefined ? { file_path } : { file_path, content },
  });

describe("generated Cursor hook scripts parse", () => {
  // The regression that motivated this whole file. A script that cannot parse
  // is worse than an absent hook: doctor says installed, Cursor fails open.
  for (const [name, body] of Object.entries(SCRIPTS)) {
    it(`${name} is syntactically valid JavaScript`, () => {
      expect(() => new Script(body, { filename: `${name}.js` })).not.toThrow();
    });

    it(`${name} never reads $HOOK_TOOL_INPUT (Claude Code-only contract)`, () => {
      // Comment lines are stripped first — the preamble deliberately NAMES the
      // Claude-only variable to explain why it is not used.
      const code = body
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");
      expect(code).not.toContain("HOOK_TOOL_INPUT");
    });

    it(`${name} exits 0 on unparseable stdin (fails open)`, () => {
      const result = runScript(body, "definitely not json");
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('"deny"');
    });
  }
});

describe("command-safety (beforeShellExecution)", () => {
  const body = SCRIPTS["command-safety"];
  const denied = (command: string) =>
    runScript(body, shell(command)).stdout.includes('"deny"');

  it.each([
    ["rm -rf ~", "rm -rf ~"],
    // The subpath cases are the ones an end-anchored pattern silently allows.
    ["rm -rf ~/Documents", "rm -rf ~/Documents"],
    ["rm -rf /Users/someone", "rm -rf /Users/someone"],
    ["rm -rf $HOME/x", "rm -rf $HOME/x"],
    ["rm -rf / (root)", "sudo rm -rf /"],
    ["separated flags", "rm -r -f ~/x"],
    ["env redirect", "echo TOKEN=1 > .env"],
    ["env append", "echo TOKEN=1 >> .env.local"],
    ["force push, flag first", "git push --force origin main"],
    // Flag-after-branch is how the command is most often typed, and a
    // sequential (non-lookahead) pattern misses it.
    ["force push, flag last", "git push origin main --force"],
    ["force push -f master", "git push -f origin master"],
    ["hardcoded key", 'ANTHROPIC_API_KEY="sk-ant-abcdefghij1234567890" node x.js'],
  ])("blocks %s", (_label, command) => {
    expect(denied(command)).toBe(true);
  });

  it.each([
    ["build output", "rm -rf dist/"],
    ["relative path", "rm -rf ./build"],
    ["scratch dir", "rm -rf /tmp/scratch"],
    ["node_modules", "rm -rf node_modules && npm install"],
    ["normal push", "git push origin main"],
    ["force push to a feature branch", "git push -f origin feat/thing"],
    ["ordinary test run", "npm test -- --watch=false"],
  ])("allows %s", (_label, command) => {
    expect(denied(command)).toBe(false);
  });

  it("blocks a production deploy off the default branch", () => {
    const dir = mkdtempSync(join(tmpdir(), "soloship-cursor-git-"));
    const git = (args: string) =>
      spawnSync("sh", ["-c", `git ${args}`], { cwd: dir, encoding: "utf8" });
    git("init -q");
    git("config user.email t@t");
    git("config user.name t");
    writeFileSync(join(dir, "f.txt"), "x");
    git("add -A");
    git("commit -qm init");
    git("checkout -q -b feat/thing");
    const result = runScript(SCRIPTS["command-safety"], shell("npm run deploy"), dir);
    rmSync(dir, { recursive: true, force: true });
    expect(result.stdout).toContain('"deny"');
  });
});

describe("file-protection (preToolUse: Write|Delete)", () => {
  const body = SCRIPTS["file-protection"];
  const denied = (payload: string) => runScript(body, payload).stdout.includes('"deny"');

  it("protects .soloship/version", () => {
    expect(denied(write("/p/.soloship/version", "9.9.9"))).toBe(true);
  });

  it("protects .soloship/version through a Delete tool call", () => {
    expect(
      denied(
        JSON.stringify({
          tool_name: "Delete",
          tool_input: { path: "/p/.soloship/version" },
        })
      )
    ).toBe(true);
  });

  it("blocks direct .env writes (the file tool bypasses the shell gate)", () => {
    expect(denied(write("/p/.env", "K=v"))).toBe(true);
    expect(denied(write("/p/.env.local", "K=v"))).toBe(true);
  });

  it("allows a file that merely starts with .env", () => {
    expect(denied(write("/p/.environment", "x"))).toBe(false);
  });

  it("blocks a plan with no frontmatter or an invalid status", () => {
    expect(denied(write("/p/docs/plans/x.md", "# Plan"))).toBe(true);
    expect(denied(write("/p/docs/plans/x.md", "---\nstatus: kinda\n---\n# X"))).toBe(true);
  });

  it("allows every status in the canonical vocabulary", () => {
    for (const status of ["backlog", "planned", "in-progress", "blocked", "done", "abandoned", "superseded"]) {
      expect(denied(write("/p/docs/plans/x.md", `---\nstatus: ${status}\n---\n# X`))).toBe(false);
    }
  });

  it("blocks status: done while the body still lists open items", () => {
    expect(denied(write("/p/docs/plans/x.md", "---\nstatus: done\n---\n- [ ] finish QA"))).toBe(true);
    expect(denied(write("/p/docs/plans/x.md", "---\nstatus: done\n---\n3. IN PROGRESS: x"))).toBe(true);
  });

  it("allows open items under a status that is still open", () => {
    expect(denied(write("/p/docs/plans/x.md", "---\nstatus: in-progress\n---\n- [ ] wip"))).toBe(false);
  });

  it("normalizes Windows separators before matching", () => {
    expect(denied(write("C:\\p\\.soloship\\version", "1"))).toBe(true);
  });

  it("fails open when the tool_input shape is unrecognized", () => {
    // Cursor does not document the Write tool's tool_input keys. An unreadable
    // payload must never block every edit in the project.
    expect(denied(JSON.stringify({ tool_name: "Write", tool_input: { mystery: "/p/docs/plans/x.md" } }))).toBe(false);
    expect(denied(write("/p/docs/plans/x.md"))).toBe(false);
  });

  it("ignores files outside the protected paths", () => {
    expect(denied(write("/p/src/app.ts", "export const x = 1;"))).toBe(false);
    expect(denied(write("/p/docs/drafts/idea.md", "# idea"))).toBe(false);
  });
});

describe("plan-truth (stop)", () => {
  const body = SCRIPTS["plan-truth"];

  function repoWithMergedPlan(planBody: string) {
    const dir = mkdtempSync(join(tmpdir(), "soloship-cursor-plan-"));
    const git = (args: string) =>
      spawnSync("sh", ["-c", `git ${args}`], { cwd: dir, encoding: "utf8" });
    git("init -q -b main");
    git("config user.email t@t");
    git("config user.name t");
    mkdirSync(join(dir, "docs", "plans"), { recursive: true });
    writeFileSync(join(dir, "docs", "plans", "a.md"), planBody);
    git("add -A");
    git("commit -qm init");
    git("checkout -q -b feat/alpha");
    writeFileSync(join(dir, "work.txt"), "done");
    git("add -A");
    git("commit -qm work");
    git("checkout -q main");
    git("merge -q --no-ff feat/alpha -m merge");
    return dir;
  }

  const payload = JSON.stringify({ status: "completed", loop_count: 0 });

  it("reports a contradiction when a merged plan is still open and has no open items", () => {
    const dir = repoWithMergedPlan("---\nstatus: in-progress\nbranch: feat/alpha\n---\n- [x] shipped\n");
    const out = runScript(body, payload, dir).stdout;
    rmSync(dir, { recursive: true, force: true });
    expect(out).toContain("PLAN STATUS CONTRADICTION");
    expect(out).toContain("followup_message");
  });

  it("softens to a review prompt when the merged plan still lists open items", () => {
    // Merged and done are not the same claim — the plan body is the tiebreaker.
    const dir = repoWithMergedPlan("---\nstatus: in-progress\nbranch: feat/alpha\n---\n- [ ] QA pending\n");
    const out = runScript(body, payload, dir).stdout;
    rmSync(dir, { recursive: true, force: true });
    expect(out).toContain("PLAN STATUS CHECK");
    expect(out).not.toContain("PLAN STATUS CONTRADICTION");
  });

  it("stays silent when the plan is already done", () => {
    const dir = repoWithMergedPlan("---\nstatus: done\nbranch: feat/alpha\n---\n");
    const out = runScript(body, payload, dir).stdout;
    rmSync(dir, { recursive: true, force: true });
    expect(out).toBe("{}");
  });

  it("stays silent outside a git repo", () => {
    expect(runScript(body, payload).stdout).toBe("{}");
  });
});

describe("scripts survive an ESM project (the silent no-op regression)", () => {
  // Soloship's own repo is `"type": "module"`, which is how this was caught.
  // Under `.js` there, every gate returned {"permission":"allow"} for every
  // input — well-formed, correct-looking, and completely inert.
  function runInEsmProject(body: string, payload: string) {
    const dir = mkdtempSync(join(tmpdir(), "soloship-cursor-esm-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", type: "module" }));
    const path = join(dir, "hook.cjs");
    writeFileSync(path, body);
    const result = spawnSync(process.execPath, [path], {
      input: payload,
      cwd: dir,
      encoding: "utf8",
      timeout: 15_000,
    });
    rmSync(dir, { recursive: true, force: true });
    return (result.stdout || "").trim();
  }

  it("still blocks a dangerous command inside a type:module project", () => {
    const out = runInEsmProject(SCRIPTS["command-safety"], shell("rm -rf ~/Projects"));
    expect(out).toContain('"deny"');
  });

  it("still protects .soloship/version inside a type:module project", () => {
    const out = runInEsmProject(
      SCRIPTS["file-protection"],
      write("/p/.soloship/version", "1")
    );
    expect(out).toContain('"deny"');
  });
});

describe("installCursorHooks (installer contract)", () => {
  it("writes .cjs scripts, wires hooks.json to paths that exist, and is idempotent", async () => {
    const dir = mkdtempSync(join(tmpdir(), "soloship-cursor-install-"));
    // A `"type": "module"` project, i.e. the shape that broke the first build.
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", type: "module" }));

    const project = { name: "x", description: "", stack: {}, hasGit: false } as never;
    await installCursorHooks(dir, project);

    // A user's own hook must survive a re-run, and ours must not duplicate.
    const hooksPath = join(dir, ".cursor", "hooks.json");
    const first = JSON.parse(readFileSync(hooksPath, "utf8"));
    first.hooks.beforeShellExecution.push({ command: ".cursor/hooks/mine.sh" });
    writeFileSync(hooksPath, JSON.stringify(first, null, 2));
    await installCursorHooks(dir, project);
    await installCursorHooks(dir, project);

    const config = JSON.parse(readFileSync(hooksPath, "utf8"));
    const commands: string[] = Object.values(config.hooks)
      .flat()
      .map((entry: never) => (entry as { command: string }).command);

    expect(config.version).toBe(1);
    expect(commands).toContain(".cursor/hooks/mine.sh");
    for (const command of commands) {
      if (command.includes("soloship-")) {
        expect(command.endsWith(".cjs")).toBe(true);
      }
      // A hooks.json entry with a dead path is a gate that never runs.
      if (command.startsWith(".cursor/")) {
        if (command.includes("soloship-")) {
          expect(existsSync(join(dir, command))).toBe(true);
        }
      }
    }
    const soloshipEntries = commands.filter((c) => c.includes("soloship-"));
    expect(soloshipEntries.length).toBe(new Set(soloshipEntries).size);

    rmSync(dir, { recursive: true, force: true });
  });
});
