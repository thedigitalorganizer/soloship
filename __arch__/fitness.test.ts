/**
 * Architecture Fitness Functions
 *
 * These tests enforce architectural boundaries. They run in CI (`npm test`) and
 * fail the build if the architecture drifts from its blueprint.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { describe, test, expect } from "vitest";
import { getWorkflowRules } from "../src/rules";

const ROOT = resolve(__dirname, "..");

// Max lines for a genuine source file. Files that are predominantly embedded
// string content (rule text, hook shell scripts) are exempt — a line limit is
// the wrong metric for content, and splitting them would be churn with no
// maintainability gain. Everything else must stay under the limit.
const MAX_SOURCE_LINES = 500;
const CONTENT_HEAVY_EXEMPT = new Set(["rules.ts", "hooks.ts"]);

// The rules Soloship ships. Update this when adding/removing a rule — the test
// then guarantees a rule can't be silently dropped from the installer.
const EXPECTED_RULES = [
  "solution-search.md",
  "plan-materialization.md",
  "plan-rationale.md",
  "plan-lifecycle.md",
  "plan-artifact-lifecycle.md",
  "plan-claim-verification.md",
  "billing-confirmation-gate.md",
  "live-data-evidence-gate.md",
  "recurrence-gate.md",
  "parameterize-constants.md",
  "browser-qa-gate.md",
  "browser-tooling-priority.md",
  "qa-plan-in-plans.md",
  "deploy-from-main-only.md",
  "automation-registry.md",
  "component-reuse.md",
  "delegation-discipline.md",
  "verification-sufficiency.md",
];

// The version files that must stay in sync every release (release-version-sync).
const VERSION_FILES: { path: string; read: (j: any) => string }[] = [
  { path: "package.json", read: (j) => j.version },
  { path: ".claude-plugin/plugin.json", read: (j) => j.version },
  { path: ".claude-plugin/marketplace.json", read: (j) => j.plugins[0].version },
  { path: ".codex-plugin/plugin.json", read: (j) => j.version },
];

function getSourceFiles(dir: string, ext = ".ts"): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;

  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
        walk(full);
      } else if (entry.isFile() && (entry.name.endsWith(ext) || entry.name.endsWith(ext + "x"))) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

describe("Architecture Fitness Functions", () => {
  test("agent guidance exists", () => {
    const hasClaudeGuide = existsSync(join(ROOT, "CLAUDE.md"));
    const hasCodexGuide = existsSync(join(ROOT, "AGENTS.md"));
    expect(hasClaudeGuide || hasCodexGuide).toBe(true);
  });

  test("CHANGELOG.md exists", () => {
    expect(existsSync(join(ROOT, "CHANGELOG.md"))).toBe(true);
  });

  test("no genuine source file exceeds the line limit (content-heavy files exempt)", () => {
    const srcDir = join(ROOT, "src");
    if (!existsSync(srcDir)) return;

    const violations: string[] = [];
    for (const file of getSourceFiles(srcDir)) {
      if (CONTENT_HEAVY_EXEMPT.has(basename(file))) continue;
      const lines = readFileSync(file, "utf-8").split("\n").length;
      if (lines > MAX_SOURCE_LINES) {
        violations.push(`${file.replace(ROOT + "/", "")} (${lines} lines)`);
      }
    }

    expect(violations).toEqual([]);
  });

  test("no hardcoded API keys in source", () => {
    const srcDir = join(ROOT, "src");
    if (!existsSync(srcDir)) return;

    const keyPattern = /(ANTHROPIC|OPENAI|STRIPE|FIREBASE)_[A-Z_]*KEY\s*=\s*["'][a-zA-Z0-9]{20,}["']/;
    const violations: string[] = [];

    for (const file of getSourceFiles(srcDir)) {
      const content = readFileSync(file, "utf-8");
      if (keyPattern.test(content)) {
        violations.push(file.replace(ROOT + "/", ""));
      }
    }

    expect(violations).toEqual([]);
  });

  test("installer ships exactly the expected rules (none silently dropped)", () => {
    const shipped = Object.keys(getWorkflowRules()).sort();
    expect(shipped).toEqual([...EXPECTED_RULES].sort());
  });

  test("every shipped rule has non-empty content", () => {
    const rules = getWorkflowRules();
    const empty = Object.entries(rules)
      .filter(([, body]) => !body || body.trim().length < 50)
      .map(([name]) => name);
    expect(empty).toEqual([]);
  });

  test("all version files are in sync (release-version-sync)", () => {
    const versions = VERSION_FILES.map(({ path, read }) => {
      const j = JSON.parse(readFileSync(join(ROOT, path), "utf-8"));
      return { path, version: read(j) };
    });
    const distinct = new Set(versions.map((v) => v.version));
    expect(distinct.size, `version drift: ${JSON.stringify(versions)}`).toBe(1);
  });
});
