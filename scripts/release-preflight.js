#!/usr/bin/env node
// Mechanical release checklist. Runs as part of prepublishOnly (blocking) and
// in CI with --ci (invariants only). Exists because every prose-only release
// rule has been missed at least once: plugin.json stuck at 0.1.0 (2026-05-11),
// marketplace.json stuck across three releases (2026-05-12), package-lock
// drift (0.21.0), git tags never pushed (v0.23.0, v0.24.0). A detail a human
// or agent can forget must be a check that refuses to publish instead.
// See .claude/rules/release-version-sync.md and publish-version-bump.md.

import { execSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ciMode = process.argv.includes("--ci");

const failures = [];
const warnings = [];
const ok = [];

function readJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), "utf-8"));
}
function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: root, stdio: ["ignore", "pipe", "pipe"] })
    .toString()
    .trim();
}

// ── Invariant 1: the four release manifests + lockfile agree ────────────────
const version = readJson("package.json").version;
const versions = {
  "package.json": version,
  "package-lock.json": readJson("package-lock.json").version,
  ".claude-plugin/plugin.json": readJson(".claude-plugin/plugin.json").version,
  ".claude-plugin/marketplace.json":
    readJson(".claude-plugin/marketplace.json").plugins[0].version,
  ".codex-plugin/plugin.json": readJson(".codex-plugin/plugin.json").version,
};
const drifted = Object.entries(versions).filter(([, v]) => v !== version);
if (drifted.length) {
  failures.push(
    `version drift (package.json says ${version}): ` +
      drifted.map(([f, v]) => `${f}=${v}`).join(", ")
  );
} else {
  ok.push(`all 5 version files agree: ${version}`);
}

// ── Invariant 2: CHANGELOG has a section for this version ───────────────────
const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf-8");
if (!changelog.includes(`## [${version}]`)) {
  failures.push(
    `CHANGELOG.md has no "## [${version}]" section — cut the release notes ` +
      `out of [Unreleased] before publishing`
  );
} else {
  ok.push(`CHANGELOG.md has a [${version}] section`);
}

// ── Invariant 3: plugin metadata validator (counts, collisions, codex sync) ─
const validator = spawnSync(
  process.execPath,
  [join(root, "scripts", "validate-plugin-metadata.js")],
  { cwd: root, encoding: "utf-8" }
);
if (validator.status !== 0) {
  failures.push(
    `validate-plugin-metadata failed:\n${(validator.stdout + validator.stderr).trim()}`
  );
} else {
  ok.push("plugin metadata validator passes");
}

// ── Git-state checks (skipped in --ci: branches/PRs legitimately differ) ────
if (!ciMode) {
  const branch = git("rev-parse --abbrev-ref HEAD");
  if (branch !== "main" && branch !== "master") {
    failures.push(`publishing from branch "${branch}" — publish from main only`);
  } else {
    ok.push(`on ${branch}`);
  }

  const dirty = git("status --porcelain");
  if (dirty) {
    failures.push(`working tree not clean:\n${dirty}`);
  } else {
    ok.push("working tree clean");
  }

  // Local tag must exist. HEAD may legitimately be ahead of the tag (infra
  // landed after the bump) — warn, don't fail.
  try {
    const tagSha = git(`rev-parse v${version}^{commit}`);
    const headSha = git("rev-parse HEAD");
    if (tagSha === headSha) {
      ok.push(`tag v${version} exists and points at HEAD`);
    } else {
      warnings.push(
        `tag v${version} exists but HEAD has moved past it — fine if only ` +
          `non-release commits landed since the bump`
      );
    }
  } catch {
    failures.push(
      `git tag v${version} does not exist — npm version creates it; ` +
        `never hand-edit package.json's version`
    );
  }

  // Remote checks are best-effort: cloud sandboxes can block tag pushes.
  try {
    const remoteTag = git(`ls-remote origin refs/tags/v${version}`);
    if (remoteTag) {
      ok.push(`tag v${version} is on origin`);
    } else {
      warnings.push(
        `tag v${version} is NOT on origin — after publishing run: ` +
          `git push origin v${version}`
      );
    }
  } catch {
    warnings.push(
      `could not query origin for tag v${version} (offline?) — verify ` +
        `git push origin v${version} happened`
    );
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
for (const line of ok) console.log(`  ✓ ${line}`);
for (const line of warnings) console.log(`  ⚠ ${line}`);
if (failures.length) {
  console.error(`\nRelease preflight FAILED (${failures.length}):`);
  for (const line of failures) console.error(`  ✗ ${line}`);
  console.error(
    `\nFix the above, or run the whole sequence mechanically: npm run release -- <patch|minor|major>`
  );
  process.exit(1);
}
console.log(
  ciMode
    ? "Release invariants OK."
    : `Release preflight OK for v${version}.` +
        (warnings.length ? " (warnings above need follow-up)" : "")
);
