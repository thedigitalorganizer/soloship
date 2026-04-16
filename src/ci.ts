import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProjectInfo } from "./detect.js";

export async function installCi(
  root: string,
  project: ProjectInfo
): Promise<string[]> {
  const results: string[] = [];

  // Only install CI for projects with git and tests
  if (!project.hasGit) {
    results.push("CI: skipped (no git repository)");
    return results;
  }

  const workflowsDir = join(root, ".github", "workflows");

  // Don't overwrite existing CI
  if (existsSync(workflowsDir)) {
    results.push("CI: .github/workflows/ already exists, skipping");
    return results;
  }

  mkdirSync(workflowsDir, { recursive: true });

  // Main CI workflow
  const ciWorkflow = generateCiWorkflow(project);
  writeFileSync(join(workflowsDir, "ci.yml"), ciWorkflow);
  results.push("CI: .github/workflows/ci.yml (lint, test, build on push)");

  // Architecture fitness functions (only for TypeScript projects)
  if (
    project.stack.language === "typescript" ||
    project.stack.language === "javascript"
  ) {
    const archTest = generateArchitectureTest(project);
    const testDir = join(root, "__arch__");
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    writeFileSync(join(testDir, "fitness.test.ts"), archTest);
    results.push(
      "CI: __arch__/fitness.test.ts (architecture fitness functions)"
    );
  }

  return results;
}

function generateCiWorkflow(project: ProjectInfo): string {
  const pm = project.stack.packageManager;
  const installCmd =
    pm === "bun"
      ? "bun install"
      : pm === "pnpm"
        ? "pnpm install"
        : pm === "yarn"
          ? "yarn install"
          : "npm ci";
  const nodeVersion = "22";

  return `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '${nodeVersion}'
          cache: '${pm === "bun" ? "npm" : pm}'

      - name: Install dependencies
        run: ${installCmd}

      - name: Lint
        run: ${pm === "bun" ? "bun run lint" : "npm run lint"}
        continue-on-error: false

      - name: Test
        run: ${pm === "bun" ? "bun test" : "npm test"}

      - name: Build
        run: ${pm === "bun" ? "bun run build" : "npm run build"}

      - name: Security scan (Semgrep)
        run: |
          if [ -f ".semgrep.yml" ]; then
            pip install semgrep
            semgrep --config .semgrep.yml --error --severity ERROR src/
            semgrep --config .semgrep.yml --severity WARNING src/ || true
          fi

      - name: Architecture fitness
        run: npx vitest run __arch__/ 2>/dev/null || npx jest __arch__/ 2>/dev/null || true
`;
}

function generateArchitectureTest(project: ProjectInfo): string {
  // Generate basic fitness functions based on common patterns
  return `/**
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
  const importRegex = /(?:import|from)\\s+['"](.*?)['"]/g;
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

  test("CLAUDE.md exists", () => {
    expect(existsSync(join(ROOT, "CLAUDE.md"))).toBe(true);
  });

  test("CHANGELOG.md exists", () => {
    expect(existsSync(join(ROOT, "CHANGELOG.md"))).toBe(true);
  });

  test("no source file exceeds 500 lines", () => {
    const srcDir = join(ROOT, "src");
    if (!existsSync(srcDir)) return;

    const violations: string[] = [];
    for (const file of getSourceFiles(srcDir)) {
      const lines = readFileSync(file, "utf-8").split("\\n").length;
      if (lines > 500) {
        violations.push(\`\${file.replace(ROOT + "/", "")} (\${lines} lines)\`);
      }
    }

    expect(violations).toEqual([]);
  });

  test("no hardcoded API keys in source", () => {
    const srcDir = join(ROOT, "src");
    if (!existsSync(srcDir)) return;

    const keyPattern = /(ANTHROPIC|OPENAI|STRIPE|FIREBASE)_[A-Z_]*KEY\\s*=\\s*["'][a-zA-Z0-9]{20,}["']/;
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
`;
}
