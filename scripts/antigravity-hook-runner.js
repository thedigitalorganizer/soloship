#!/usr/bin/env node

/**
 * Soloship Antigravity Hook Runner
 * 
 * Intercepts Antigravity tool calls and lifecycle events to enforce
 * Soloship safety guardrails, plan verification, and deploy discipline.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { execSync } from "node:child_process";

const mode = process.argv[2] || "pre-command";

function getGitRoot() {
  try {
    return execSync("git rev-parse --show-toplevel 2>/dev/null", {
      encoding: "utf-8",
    }).trim();
  } catch {
    return process.cwd();
  }
}

function getCurrentBranch() {
  try {
    return execSync("git branch --show-current 2>/dev/null", {
      encoding: "utf-8",
    }).trim();
  } catch {
    return "";
  }
}

function readStdinJson() {
  try {
    const input = readFileSync(0, "utf-8");
    if (!input || !input.trim()) return {};
    return JSON.parse(input);
  } catch {
    return {};
  }
}

function respond(data) {
  process.stdout.write(JSON.stringify(data) + "\n");
  process.exit(0);
}

function allow() {
  respond({ decision: "allow" });
}

function deny(reason) {
  respond({ decision: "deny", reason });
}

function handlePreCommand(payload) {
  const toolCall = payload.toolCall || {};
  const command = toolCall.args?.CommandLine || "";

  if (!command) return allow();

  // 1. Dangerous rm -rf
  if (/\brm\s+-rf\s+(~|\/Users|\/home|\$HOME|\/)\b/.test(command)) {
    return deny("BLOCKED: Dangerous rm -rf targeting home or root directory.");
  }

  // 2. Direct .env modification via echo/cat/redirect
  if (/(?:cat|echo|printf|>)\s*.*\.env(?:\s|$)/.test(command)) {
    return deny(
      "BLOCKED: Direct .env file modification via shell command. Please edit secrets responsibly."
    );
  }

  // 3. Force push to main/master
  if (/git\s+push.*--force.*(?:main|master)/.test(command)) {
    return deny("BLOCKED: Force push to main/master branch is prohibited.");
  }

  // 4. Hardcoded API keys
  if (
    /(?:ANTHROPIC|OPENAI|STRIPE|FIREBASE|GEMINI)_[A-Z_]*KEY\s*=\s*["'][a-zA-Z0-9]{20,}["']/.test(
      command
    )
  ) {
    return deny("BLOCKED: Detected possible hardcoded API key in command.");
  }

  // 5. Deploy Discipline: Deploy only from main branch
  if (
    /(?:npm\s+run\s+deploy|wrangler\s+deploy|fly\s+deploy|vercel\s+--prod|npx\s+sst\s+deploy)/.test(
      command
    )
  ) {
    const branch = getCurrentBranch();
    if (branch && branch !== "main" && branch !== "master") {
      return deny(
        `BLOCKED by deploy-from-main-only: Current branch is "${branch}". Deployments must only be run from the main branch.`
      );
    }
  }

  // 6. Plan Truth Gate: Cannot commit code on a feature branch while plan status is still "planned"
  if (/git\s+commit/.test(command)) {
    const root = getGitRoot();
    const branch = getCurrentBranch();
    const plansDir = join(root, "docs", "plans");

    if (
      branch &&
      branch !== "main" &&
      branch !== "master" &&
      existsSync(plansDir)
    ) {
      try {
        const files = readdirSync(plansDir).filter((f) => f.endsWith(".md"));
        for (const file of files) {
          const content = readFileSync(join(plansDir, file), "utf-8");
          // Check if plan matches branch or is active
          if (content.includes(`status: planned`)) {
            const hasBranchRef =
              content.includes(branch) ||
              content.includes(branch.replace(/^[a-z]+\//, ""));
            if (hasBranchRef) {
              return deny(
                `BLOCKED by plan-truth-gate: You are committing code on branch "${branch}", but plan "${file}" still says "status: planned". Please update the plan status to "in-progress" before committing code.`
              );
            }
          }
        }
      } catch {
        // Ignore read errors
      }
    }
  }

  return allow();
}

function handlePreWrite(payload) {
  const toolCall = payload.toolCall || {};
  const targetFile =
    toolCall.args?.TargetFile ||
    toolCall.args?.AbsolutePath ||
    toolCall.args?.path ||
    "";
  const content =
    toolCall.args?.CodeContent ||
    toolCall.args?.ReplacementContent ||
    toolCall.args?.content ||
    "";

  if (!targetFile) return allow();

  const fileBase = basename(targetFile);

  // 1. Protect .soloship/version
  if (targetFile.includes(".soloship/version")) {
    return deny(
      "BLOCKED: .soloship/version is managed exclusively by the Soloship CLI. Do not edit manually."
    );
  }

  // 2. Plan Format Validation for docs/plans/*.md
  if (targetFile.includes("docs/plans") && targetFile.endsWith(".md")) {
    if (content) {
      const hasFrontmatter = content.startsWith("---");
      const hasStatus = /status:\s*(?:backlog|planned|in-progress|blocked|done|abandoned|superseded)/.test(
        content
      );
      if (!hasFrontmatter || !hasStatus) {
        return deny(
          "BLOCKED: Plans in docs/plans/ must contain valid YAML frontmatter with a recognized status (e.g. status: planned, in-progress, done, backlog)."
        );
      }
    }
  }

  return allow();
}

function handleStop(payload) {
  const root = getGitRoot();
  const branch = getCurrentBranch();
  const plansDir = join(root, "docs", "plans");

  // Check for lying plans (branch merged into main, but plan still says in-progress)
  if (existsSync(plansDir) && (branch === "main" || branch === "master")) {
    try {
      const files = readdirSync(plansDir).filter((f) => f.endsWith(".md"));
      for (const file of files) {
        const content = readFileSync(join(plansDir, file), "utf-8");
        if (content.includes("status: in-progress")) {
          // If branch was already merged
          const branchMatch = content.match(/branch:\s*([^\s\n]+)/);
          if (branchMatch && branchMatch[1]) {
            const planBranch = branchMatch[1];
            try {
              const merged = execSync(
                `git branch --merged ${branch} 2>/dev/null`,
                { encoding: "utf-8" }
              );
              if (merged.includes(planBranch)) {
                return respond({
                  decision: "continue",
                  reason: `PLAN STATUS CONTRADICTION: Branch "${planBranch}" is already merged into ${branch}, but plan "${file}" still says "status: in-progress". Please update it to "status: done".`,
                });
              }
            } catch {
              // Ignore git check errors
            }
          }
        }
      }
    } catch {
      // Ignore directory scan errors
    }
  }

  return respond({});
}

const payload = readStdinJson();

switch (mode) {
  case "pre-command":
    handlePreCommand(payload);
    break;
  case "pre-write":
    handlePreWrite(payload);
    break;
  case "stop":
    handleStop(payload);
    break;
  default:
    allow();
    break;
}
