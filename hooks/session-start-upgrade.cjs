#!/usr/bin/env node
"use strict";

// Phase 5 of docs/plans/2026-08-27-one-source-of-truth-across-agent-hosts.md.
//
// A Claude Code PLUGIN SessionStart hook (ships with Soloship itself, wired
// via ../.claude-plugin/plugin.json's "hooks" field + ./hooks.json — distinct
// from the per-project gate scripts in scripts/soloship-hooks/, which
// `soloship init`/`upgrade` install INTO a project).
//
// Everything Phases 1, 2, and 4 built (hooks, rules, skills layout) is
// mechanical and idempotent, so a version bump can run unattended: if the
// plugin running this session is newer than the project's stamped
// .soloship/version, silently run `npx soloship upgrade` and tell the
// session what changed. Never blocks session start — every failure path
// below exits 0 with no output and just waits for next session.
//
// Never runs `--agent all`: that forces every host surface into existence
// unconditionally (see src/agents.ts resolveAgentSelection). The plain,
// no-flag invocation resolves to "auto" — presence-detected hosts only,
// which is what "upgrade everything this project already uses" means.

const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const NO_AUTO_UPGRADE_FILE = ".soloship/no-auto-upgrade";
const VERSION_STAMP_FILE = ".soloship/version";
const MANAGED_PATHS = [
  ".claude",
  ".codex",
  ".agents",
  ".cursor",
  "scripts/soloship-hooks",
  ".soloship/version",
];
const UPGRADE_TIMEOUT_MS = 30_000;

function readStdin() {
  try {
    return readFileSync(0, "utf-8");
  } catch {
    return "";
  }
}

function emit(hookOutput) {
  if (hookOutput) {
    process.stdout.write(JSON.stringify(hookOutput) + "\n");
  }
  process.exit(0);
}

/** "1.2.3" -> [1,2,3]; malformed input sorts as older so we never crash-loop. */
function parseVersion(v) {
  const parts = String(v || "").trim().split(".").map((n) => parseInt(n, 10));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function isNewer(a, b) {
  const [a1, a2, a3] = parseVersion(a);
  const [b1, b2, b3] = parseVersion(b);
  if (a1 !== b1) return a1 > b1;
  if (a2 !== b2) return a2 > b2;
  return a3 > b3;
}

function main() {
  const raw = readStdin();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }

  const root = payload.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (!pluginRoot) return emit(null); // can't verify our own version — fail open

  if (existsSync(join(root, NO_AUTO_UPGRADE_FILE))) return emit(null);

  const stampPath = join(root, VERSION_STAMP_FILE);
  if (!existsSync(stampPath)) return emit(null); // Soloship isn't set up here

  let stampedVersion;
  try {
    stampedVersion = readFileSync(stampPath, "utf-8").trim();
  } catch {
    return emit(null);
  }

  let pluginVersion;
  try {
    const manifest = JSON.parse(
      readFileSync(join(pluginRoot, ".claude-plugin", "plugin.json"), "utf-8")
    );
    pluginVersion = manifest.version;
  } catch {
    return emit(null);
  }
  if (!pluginVersion) return emit(null);

  if (!isNewer(pluginVersion, stampedVersion)) return emit(null); // up to date

  // Only proceed inside a git repo, and only when nothing Soloship-managed is
  // already mid-edit — a dirty src/ or docs/ must not block this, a dirty
  // .claude/ or .codex/hooks.json must (someone's actively working there).
  const isRepo = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: root,
    stdio: "ignore",
  });
  if (isRepo.status !== 0) return emit(null);

  const status = spawnSync(
    "git",
    ["status", "--porcelain", "--", ...MANAGED_PATHS],
    { cwd: root, encoding: "utf-8" }
  );
  if (status.status !== 0) return emit(null);
  if (status.stdout && status.stdout.trim().length > 0) return emit(null);

  const upgrade = spawnSync(
    "npx",
    ["-y", `soloship@${pluginVersion}`, "upgrade", "--quiet"],
    { cwd: root, encoding: "utf-8", timeout: UPGRADE_TIMEOUT_MS }
  );
  if (upgrade.error || upgrade.status !== 0) return emit(null); // retry next session

  emit({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      systemMessage:
        `Soloship auto-upgraded this project from v${stampedVersion} to v${pluginVersion} ` +
        `(newer plugin version detected at session start). ` +
        `Generated files under .claude/, .codex/, .agents/, .cursor/, and .soloship/ may have ` +
        `changed — run \`git status\` and commit them if they look correct. ` +
        `To stop this happening automatically, create ${NO_AUTO_UPGRADE_FILE}.`,
    },
  });
}

try {
  main();
} catch {
  emit(null); // never block a session start on this hook's account
}
