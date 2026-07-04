/**
 * Architecture Fitness Functions
 *
 * These tests enforce architectural boundaries. They run in CI and fail
 * the build if the architecture drifts from its blueprint.
 *
 * Customize these rules based on your project's module boundaries.
 * Run /audit to discover what rules should be added.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, test, expect } from "vitest";

const ROOT = resolve(__dirname, "..");

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

function getImports(filePath: string): string[] {
  const content = readFileSync(filePath, "utf-8");
  const imports: string[] = [];
  const importRegex = /(?:import|from)\s+['"](.*?)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

describe("Architecture Fitness Functions", () => {
  test("no circular directory dependencies at top level", () => {
    // This is a placeholder — customize based on your project structure.
    // Example: src/pages/ should not import from src/components/
    // if components/ imports from pages/ (circular).
    expect(true).toBe(true);
  });

  test("agent guidance exists", () => {
    const hasClaudeGuide = existsSync(join(ROOT, "CLAUDE.md"));
    const hasCodexGuide = existsSync(join(ROOT, "AGENTS.md"));
    expect(hasClaudeGuide || hasCodexGuide).toBe(true);
  });

  test("CHANGELOG.md exists", () => {
    expect(existsSync(join(ROOT, "CHANGELOG.md"))).toBe(true);
  });

  test("no source file exceeds 500 lines", () => {
    const srcDir = join(ROOT, "src");
    if (!existsSync(srcDir)) return;

    const violations: string[] = [];
    for (const file of getSourceFiles(srcDir)) {
      const lines = readFileSync(file, "utf-8").split("\n").length;
      if (lines > 500) {
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
});
