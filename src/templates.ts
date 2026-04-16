import type { ProjectInfo } from "./detect.js";

export function generateClaudeMd(project: ProjectInfo): string {
  const stackLine = [
    project.stack.language === "typescript"
      ? "TypeScript"
      : project.stack.language === "javascript"
        ? "JavaScript"
        : project.stack.language === "python"
          ? "Python"
          : "",
    project.stack.framework || "",
  ]
    .filter(Boolean)
    .join(" + ");

  return `# CLAUDE.md — AI Assistant Guide

**${project.name}**${project.description ? ` — ${project.description}` : ""}

${stackLine ? `**Stack:** ${stackLine}\n` : ""}
## Related Documentation

| Document | Location | Purpose |
|----------|----------|---------|
| Changelog | [CHANGELOG.md](CHANGELOG.md) | Version history and release notes |
| Solution Guide | [docs/SOLUTION_GUIDE.md](docs/SOLUTION_GUIDE.md) | Solution doc schema and template |

## Project Structure

\`\`\`
TODO: Run /audit or /bootstrap to populate this section
\`\`\`

## Quick Commands

\`\`\`bash
# TODO: Add project-specific commands here
\`\`\`

## Intent Layer

**Before modifying code in a subdirectory, read its AGENTS.md first.**

## Cross-Cutting Contracts

<!-- TODO: Run /audit to discover cross-cutting contracts -->

## Global Invariants

<!-- TODO: Add project-specific invariants discovered by /audit -->

## Workflow

This project follows: **THINK → PLAN → WORK → LEARN → SHIP**

| Phase | Tool | When to Upgrade |
|-------|------|-----------------|
| Think | /brainstorm | Always start here for new work |
| Plan | /plan | After brainstorming + visual design |
| Work | /implement | Execute the plan |
| Learn | /learn | After non-obvious fixes |
| Ship | /shipfast or /shipthorough | Fast for hotfixes, thorough for features |

## Rules

Coding conventions and workflow rules auto-load from \`.claude/rules/\`.
`;
}

export function generateAgentsMd(project: ProjectInfo): string {
  return `# AGENTS.md — Project Root

## Scope

Top-level project configuration, documentation, and cross-cutting concerns.

## Owns

- CLAUDE.md — project configuration for AI agents
- CHANGELOG.md — version history
- docs/ — plans, solutions, architecture, audit reports
- Project configuration files (package.json, tsconfig.json, etc.)

## Contracts

- All subdirectories should have their own AGENTS.md describing scope and contracts
- Changes to shared types or interfaces must be noted in CHANGELOG.md
- Plans go in docs/plans/, solutions go in docs/solutions/

## Key Files

| File | Purpose |
|------|---------|
| CLAUDE.md | AI agent configuration |
| CHANGELOG.md | Version history |
| docs/SOLUTION_GUIDE.md | Schema for solution docs |

<!-- Run /audit to discover and populate subdirectory AGENTS.md files -->
`;
}

export function generateChangelog(project: ProjectInfo): string {
  const today = new Date().toISOString().split("T")[0];
  return `# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Soloship initialized (${today})
`;
}

export function generateSolutionGuide(): string {
  return `# Solution Guide

## What Goes Here

Every non-obvious fix or significant feature produces a solution doc. These accumulate
in \`docs/solutions/<category>/\` and are searched before every planning session.

## Categories

- api-issues
- auth-bugs
- infrastructure
- integration-issues
- pdf-issues
- performance
- refactoring
- security
- ui-bugs

Create new categories as needed.

## Template

\`\`\`markdown
---
title: Short descriptive title
date: YYYY-MM-DD
category: one-of-the-above
components: [list, of, affected, components]
files: [list, of, key, files]
symptoms: [what, the, user, sees]
error_messages: [exact, error, strings]
tags: [searchable, keywords]
---

## Problem

What went wrong. Include error messages, screenshots, or reproduction steps.

## Root Cause

Why it happened. Be specific — name the file, line, and mechanism.

## Solution

What was done to fix it. Include code snippets if helpful.

## Prevention

How to prevent this from happening again. This is the most important section.
Rules, tests, or checks that should be added.

## Related

Links to PRs, issues, or other solution docs.
\`\`\`

## When to Write One

- After any bug fix that took more than 15 minutes to diagnose
- After any feature that required non-obvious architectural decisions
- After any refactoring that changed how components interact
- When you discover a gotcha that would bite future developers
`;
}
