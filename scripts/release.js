#!/usr/bin/env node
// The one release command: npm run release -- <patch|minor|major> [--dry-run]
//
// Automates the full sequence from .claude/rules/release-version-sync.md so no
// agent or human ever hand-runs it again: bump, sync ALL manifests, amend into
// the version commit, retag, preflight, push main + tag, then hand off to
// `npm publish` (whose prepublishOnly re-runs the preflight as the hard gate).
// --dry-run validates preconditions and stops before touching anything.

import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2).filter((a) => a !== "--");
const dryRun = args.includes("--dry-run");
const bump = args.find((a) => ["patch", "minor", "major"].includes(a));

if (!bump) {
  console.error("Usage: npm run release -- <patch|minor|major> [--dry-run]");
  process.exit(1);
}

function sh(cmd, opts = {}) {
  return execSync(cmd, { cwd: root, stdio: ["ignore", "pipe", "pipe"], ...opts })
    .toString()
    .trim();
}
function run(cmd) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd: root, stdio: "inherit" });
}

// ── Preconditions ───────────────────────────────────────────────────────────
const branch = sh("git rev-parse --abbrev-ref HEAD");
if (branch !== "main" && branch !== "master") {
  console.error(`Releases cut from main only (on "${branch}").`);
  process.exit(1);
}
if (sh("git status --porcelain")) {
  console.error("Working tree not clean — commit or stash first.");
  process.exit(1);
}
try {
  sh("git fetch origin " + branch);
  const behind = sh(`git rev-list HEAD..origin/${branch} --count`);
  if (behind !== "0") {
    console.error(`main is ${behind} commit(s) behind origin — pull first.`);
    process.exit(1);
  }
} catch {
  console.log("  ⚠ could not reach origin — releasing from local state");
}

const current = JSON.parse(readFileSync(join(root, "package.json"), "utf-8")).version;
console.log(`Releasing: ${current} → ${bump} bump${dryRun ? " (dry run)" : ""}`);
if (dryRun) {
  console.log("Dry run: preconditions OK, stopping before any mutation.");
  process.exit(0);
}

// ── Bump + sync every manifest + amend + retag ──────────────────────────────
run(`npm version ${bump}`);
const next = JSON.parse(readFileSync(join(root, "package.json"), "utf-8")).version;

const syncTargets = [
  [".claude-plugin/plugin.json", (j) => (j.version = next)],
  [".claude-plugin/marketplace.json", (j) => (j.plugins[0].version = next)],
  [".codex-plugin/plugin.json", (j) => (j.version = next)],
];
for (const [rel, apply] of syncTargets) {
  const path = join(root, rel);
  const json = JSON.parse(readFileSync(path, "utf-8"));
  apply(json);
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
  console.log(`  synced ${rel} → ${next}`);
}

run("git add .claude-plugin/plugin.json .claude-plugin/marketplace.json .codex-plugin/plugin.json");
run("git commit --amend --no-edit");
run(`git tag -f v${next}`);

// ── Preflight gate before anything leaves the machine ───────────────────────
run("node scripts/release-preflight.js");

// ── Push commit and tag (tag push verified, not assumed) ────────────────────
run(`git push origin ${branch} --follow-tags --force-with-lease`);
try {
  run(`git push origin v${next} --force`);
} catch {
  // fall through to verification below
}
let tagOnRemote = false;
try {
  tagOnRemote = Boolean(sh(`git ls-remote origin refs/tags/v${next}`));
} catch {
  /* offline */
}
if (!tagOnRemote) {
  console.log(
    `  ⚠ tag v${next} did not reach origin (sandbox proxies block tag pushes).` +
      `\n    From a normal machine: git push origin v${next}`
  );
}

console.log(`\nRelease v${next} staged. Final step:\n  npm publish`);
console.log("(prepublishOnly re-runs the registry check and this preflight.)");
