// Phase 5 of docs/plans/2026-08-27-one-source-of-truth-across-agent-hosts.md:
// hooks/session-start-upgrade.cjs is a Claude Code PLUGIN SessionStart hook
// (not compiled from src/, not a project-installed gate) — exercised here by
// actually spawning `node` against fixture project + plugin-root directories,
// the same discipline __arch__/committed-gates.test.ts applies to the
// per-project gate scripts.

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const HOOK_PATH = join(__dirname, "..", "hooks", "session-start-upgrade.cjs");

function tmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** A fake `npx` on PATH that writes a marker file (proving it ran) and stamps
 * .soloship/version to the version it was asked for, mimicking what a real
 * `soloship upgrade` run does — without touching the network. */
function fakeNpxBin(markerPath: string): string {
  const binDir = tmp("soloship-fake-npx-");
  const script = `#!/bin/sh
echo "$@" >> "${markerPath}"
# args: -y soloship@<version> upgrade --quiet
VER=$(echo "$2" | sed 's/soloship@//')
echo "$VER" > "$PWD/.soloship/version"
exit 0
`;
  const path = join(binDir, "npx");
  writeFileSync(path, script);
  chmodSync(path, 0o755);
  return binDir;
}

function setupProject(opts: {
  stampedVersion?: string; // omit to skip writing .soloship/version
  optOut?: boolean;
  git?: boolean;
  dirtyManagedPath?: boolean;
  dirtyUnrelatedPath?: boolean;
}): string {
  const root = tmp("soloship-hook-project-");
  mkdirSync(join(root, ".soloship"), { recursive: true });
  if (opts.stampedVersion !== undefined) {
    writeFileSync(join(root, ".soloship", "version"), opts.stampedVersion + "\n");
  }
  if (opts.optOut) {
    writeFileSync(join(root, ".soloship", "no-auto-upgrade"), "");
  }
  if (opts.git) {
    spawnSync("git", ["init", "-q"], { cwd: root });
    spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
    spawnSync("git", ["config", "user.name", "test"], { cwd: root });
    writeFileSync(join(root, "README.md"), "seed\n");
    spawnSync("git", ["add", "."], { cwd: root });
    spawnSync("git", ["commit", "-q", "-m", "seed"], { cwd: root });
  }
  if (opts.dirtyManagedPath) {
    // NOTE: .claude/settings.local.json is deliberately NOT used for this —
    // Soloship's own .gitignore (and every project it scaffolds) excludes
    // that exact file by convention, so it would never show as dirty here.
    // scripts/soloship-hooks/ is a genuinely trackable managed path.
    mkdirSync(join(root, "scripts", "soloship-hooks"), { recursive: true });
    writeFileSync(join(root, "scripts", "soloship-hooks", "wip.cjs"), "// wip\n");
  }
  if (opts.dirtyUnrelatedPath) {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "foo.ts"), "// wip\n");
  }
  return root;
}

function pluginRootWithVersion(version: string): string {
  const root = tmp("soloship-hook-plugin-");
  mkdirSync(join(root, ".claude-plugin"), { recursive: true });
  writeFileSync(
    join(root, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "soloship", version })
  );
  return root;
}

function runHook(
  projectRoot: string,
  pluginRoot: string | undefined,
  extraPath?: string
): { status: number | null; stdout: string } {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (pluginRoot) env.CLAUDE_PLUGIN_ROOT = pluginRoot;
  else delete env.CLAUDE_PLUGIN_ROOT;
  if (extraPath) env.PATH = `${extraPath}:${env.PATH}`;

  const result = spawnSync("node", [HOOK_PATH], {
    cwd: projectRoot,
    input: JSON.stringify({ cwd: projectRoot, hook_event_name: "SessionStart" }),
    encoding: "utf-8",
    env,
  });
  return { status: result.status, stdout: result.stdout || "" };
}

function cleanup(...paths: string[]) {
  for (const p of paths) rmSync(p, { recursive: true, force: true });
}

describe("hooks/session-start-upgrade.cjs", () => {
  it("no-ops silently when .soloship/version doesn't exist", () => {
    const project = setupProject({ git: true });
    const plugin = pluginRootWithVersion("0.28.0");
    try {
      const { status, stdout } = runHook(project, plugin);
      expect(status).toBe(0);
      expect(stdout.trim()).toBe("");
    } finally {
      cleanup(project, plugin);
    }
  });

  it("no-ops silently when .soloship/no-auto-upgrade opt-out file exists", () => {
    const project = setupProject({ stampedVersion: "0.27.0", optOut: true, git: true });
    const plugin = pluginRootWithVersion("0.28.0");
    try {
      const { status, stdout } = runHook(project, plugin);
      expect(status).toBe(0);
      expect(stdout.trim()).toBe("");
    } finally {
      cleanup(project, plugin);
    }
  });

  it("no-ops silently when the stamped version is already current", () => {
    const project = setupProject({ stampedVersion: "0.28.0", git: true });
    const plugin = pluginRootWithVersion("0.28.0");
    try {
      const { status, stdout } = runHook(project, plugin);
      expect(status).toBe(0);
      expect(stdout.trim()).toBe("");
    } finally {
      cleanup(project, plugin);
    }
  });

  it("no-ops silently when CLAUDE_PLUGIN_ROOT is unset (can't verify our own version)", () => {
    const project = setupProject({ stampedVersion: "0.27.0", git: true });
    try {
      const { status, stdout } = runHook(project, undefined);
      expect(status).toBe(0);
      expect(stdout.trim()).toBe("");
    } finally {
      cleanup(project);
    }
  });

  it("no-ops silently outside a git repo, even with a stale stamp", () => {
    const project = setupProject({ stampedVersion: "0.27.0", git: false });
    const plugin = pluginRootWithVersion("0.28.0");
    try {
      const { status, stdout } = runHook(project, plugin);
      expect(status).toBe(0);
      expect(stdout.trim()).toBe("");
    } finally {
      cleanup(project, plugin);
    }
  });

  it("skips (does not invoke npx) when a Soloship-managed path is dirty", () => {
    const project = setupProject({
      stampedVersion: "0.27.0",
      git: true,
      dirtyManagedPath: true,
    });
    const plugin = pluginRootWithVersion("0.28.0");
    const marker = join(project, "npx-invoked.log");
    const bin = fakeNpxBin(marker);
    try {
      const { status, stdout } = runHook(project, plugin, bin);
      expect(status).toBe(0);
      expect(stdout.trim()).toBe("");
      // marker must NOT have been created — npx was never invoked
      expect(existsSync(marker)).toBe(false);
    } finally {
      cleanup(project, plugin, bin);
    }
  });

  it("upgrades and emits a systemMessage when only an UNRELATED path is dirty", () => {
    const project = setupProject({
      stampedVersion: "0.27.0",
      git: true,
      dirtyUnrelatedPath: true,
    });
    const plugin = pluginRootWithVersion("0.28.0");
    const marker = join(project, "npx-invoked.log");
    const bin = fakeNpxBin(marker);
    try {
      const { status, stdout } = runHook(project, plugin, bin);
      expect(status).toBe(0);
      expect(existsSync(marker)).toBe(true); // npx WAS invoked — dirty src/ doesn't block
      expect(readFileSync(marker, "utf-8")).toContain("soloship@0.28.0");
      expect(readFileSync(marker, "utf-8")).toContain("upgrade");
      expect(readFileSync(marker, "utf-8")).toContain("--quiet");

      const parsed = JSON.parse(stdout.trim());
      expect(parsed.hookSpecificOutput.hookEventName).toBe("SessionStart");
      expect(parsed.hookSpecificOutput.systemMessage).toContain("v0.27.0");
      expect(parsed.hookSpecificOutput.systemMessage).toContain("v0.28.0");
      expect(parsed.hookSpecificOutput.systemMessage).toContain("no-auto-upgrade");

      // Never --agent all: that force-creates every host surface
      // unconditionally (src/agents.ts resolveAgentSelection). The real
      // invocation must be the plain, no-flag "auto" (presence-detected) form.
      expect(readFileSync(marker, "utf-8")).not.toContain("--agent");
    } finally {
      cleanup(project, plugin, bin);
    }
  });

  it("survives a malformed stdin payload without crashing", () => {
    const project = setupProject({ stampedVersion: "0.27.0", git: true });
    const plugin = pluginRootWithVersion("0.28.0");
    try {
      const result = spawnSync("node", [HOOK_PATH], {
        cwd: project,
        input: "not json{{{",
        encoding: "utf-8",
        env: { ...process.env, CLAUDE_PLUGIN_ROOT: plugin },
      });
      expect(result.status).toBe(0);
    } finally {
      cleanup(project, plugin);
    }
  });
});
