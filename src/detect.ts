import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ProjectInfo {
  name: string;
  description: string;
  stack: StackInfo;
  hasGit: boolean;
  hasClaude: boolean;
  existingDocs: ExistingDocs;
}

export interface StackInfo {
  language: "typescript" | "javascript" | "python" | "unknown";
  framework: string | null;
  packageManager: "npm" | "yarn" | "pnpm" | "bun" | "pip" | "unknown";
  hasTests: boolean;
  hasCi: boolean;
  hasLinter: boolean;
  hasFormatter: boolean;
}

export interface ExistingDocs {
  hasClaudeMd: boolean;
  hasAgentsMd: boolean;
  hasChangelog: boolean;
  hasReadme: boolean;
  hasDocsDir: boolean;
  hasPlansDir: boolean;
  hasSolutionsDir: boolean;
}

/**
 * Detect project type, stack, and existing infrastructure from the filesystem.
 */
export function detectProject(root: string): Partial<ProjectInfo> {
  const stack = detectStack(root);
  const existingDocs = detectExistingDocs(root);
  const name = detectName(root);

  return {
    name,
    stack,
    hasGit: existsSync(join(root, ".git")),
    hasClaude: existsSync(join(root, ".claude")),
    existingDocs,
  };
}

function detectStack(root: string): StackInfo {
  const info: StackInfo = {
    language: "unknown",
    framework: null,
    packageManager: "unknown",
    hasTests: false,
    hasCi: false,
    hasLinter: false,
    hasFormatter: false,
  };

  // Check for package.json (Node.js/JS/TS projects)
  const pkgPath = join(root, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };

      // Language
      if (allDeps["typescript"] || existsSync(join(root, "tsconfig.json"))) {
        info.language = "typescript";
      } else {
        info.language = "javascript";
      }

      // Framework detection
      if (allDeps["react"]) info.framework = "react";
      else if (allDeps["next"]) info.framework = "nextjs";
      else if (allDeps["vue"]) info.framework = "vue";
      else if (allDeps["svelte"]) info.framework = "svelte";
      else if (allDeps["express"]) info.framework = "express";
      else if (allDeps["fastify"]) info.framework = "fastify";

      // Package manager
      if (existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock")))
        info.packageManager = "bun";
      else if (existsSync(join(root, "pnpm-lock.yaml")))
        info.packageManager = "pnpm";
      else if (existsSync(join(root, "yarn.lock")))
        info.packageManager = "yarn";
      else info.packageManager = "npm";

      // Tests
      info.hasTests = !!(
        allDeps["jest"] ||
        allDeps["vitest"] ||
        allDeps["mocha"] ||
        allDeps["@testing-library/react"] ||
        pkg.scripts?.test
      );

      // Linter
      info.hasLinter = !!(
        allDeps["eslint"] ||
        allDeps["biome"] ||
        existsSync(join(root, ".eslintrc.json")) ||
        existsSync(join(root, ".eslintrc.js")) ||
        existsSync(join(root, "eslint.config.js")) ||
        existsSync(join(root, "eslint.config.mjs"))
      );

      // Formatter
      info.hasFormatter = !!(
        allDeps["prettier"] ||
        allDeps["biome"] ||
        existsSync(join(root, ".prettierrc")) ||
        existsSync(join(root, ".prettierrc.json"))
      );
    } catch {
      // Invalid package.json, continue with defaults
    }
  }

  // Check for Python
  if (
    existsSync(join(root, "requirements.txt")) ||
    existsSync(join(root, "pyproject.toml")) ||
    existsSync(join(root, "setup.py"))
  ) {
    info.language = "python";
    info.packageManager = "pip";
  }

  // CI detection
  info.hasCi =
    existsSync(join(root, ".github", "workflows")) ||
    existsSync(join(root, ".gitlab-ci.yml")) ||
    existsSync(join(root, ".circleci"));

  return info;
}

function detectExistingDocs(root: string): ExistingDocs {
  return {
    hasClaudeMd: existsSync(join(root, "CLAUDE.md")),
    hasAgentsMd: existsSync(join(root, "AGENTS.md")),
    hasChangelog: existsSync(join(root, "CHANGELOG.md")),
    hasReadme:
      existsSync(join(root, "README.md")) ||
      existsSync(join(root, "readme.md")),
    hasDocsDir: existsSync(join(root, "docs")),
    hasPlansDir: existsSync(join(root, "docs", "plans")),
    hasSolutionsDir: existsSync(join(root, "docs", "solutions")),
  };
}

function detectName(root: string): string | undefined {
  const pkgPath = join(root, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      return pkg.name;
    } catch {
      return undefined;
    }
  }
  return undefined;
}
