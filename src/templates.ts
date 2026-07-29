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
> **Audience note:** The maintainer of this project may not be a traditional coder — Soloship is built for people who ship software through AI agents. When explaining anything technical (architecture, protocols, tooling, tradeoffs), lead with a plain-English analogy before introducing jargon. Define a technical term once with its meaning, then use it freely. Default to recommendations with tradeoffs, not term-paper breakdowns.
>
> Be brief: lead with the conclusion, cut preamble and recap, length should track the question's actual complexity rather than fill space. Frame problems and decisions in product or user-experience terms — what behavior changes and why it matters — not implementation details. Never ask the maintainer to review code, judge technical correctness, or decide implementation specifics (data models, database structure, library choices); make those calls yourself and surface only choices that need their product judgment.
>
> If the maintainer signals they want the technical version ("go deeper," "show me the code"), switch registers. Otherwise, keep it concrete.

## Related Documentation

| Document | Location | Purpose |
|----------|----------|---------|
| Changelog | [CHANGELOG.md](CHANGELOG.md) | Version history and release notes |
| Solution Guide | [docs/SOLUTION_GUIDE.md](docs/SOLUTION_GUIDE.md) | Solution doc schema and template |
| Automation Registry | [docs/automations/registry.json](docs/automations/registry.json) | Every cron/webhook/scheduled job this project owns + its watchdog thresholds |

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

Coding conventions and workflow rules auto-load from \`.claude/rules/\` — including **parameterize-constants** (no magic literals; refactor un-parameterized values when you encounter them, then list other affected sites and ask). **automation-registry** applies to any cron/webhook/scheduled-job work: register in \`docs/automations/registry.json\`, wire a check-in, observe it land — one watchdog, never per-job watchdogs (\`/soloship:cron\` is the console).

## Agent Surfaces

Claude Code uses this \`CLAUDE.md\` file plus \`.claude/rules/\` and \`.claude/settings.local.json\`.
Codex uses \`AGENTS.md\` plus \`.codex/rules/\`. Keep behavior aligned across both when changing project guardrails.
`;
}

export function generateAgentsMd(project: ProjectInfo): string {
  return `# AGENTS.md — Project Root

## Scope

Top-level project configuration, documentation, and cross-cutting concerns.

## Audience Note

The maintainer may not be a traditional coder. Explain technical work with a plain-English analogy before jargon, define each technical term once, and frame decisions by user impact instead of implementation detail.

## Owns

- CLAUDE.md — project configuration for AI agents
- AGENTS.md — project configuration for Codex
- CHANGELOG.md — version history
- docs/ — plans, solutions, architecture, audit reports
- docs/automations/ — the automation registry (every cron/webhook/scheduled job + watchdog thresholds)
- Project configuration files (package.json, tsconfig.json, etc.)

## Contracts

- All subdirectories should have their own AGENTS.md describing scope and contracts
- Changes to shared types or interfaces must be noted in CHANGELOG.md
- Plans go in docs/plans/, solutions go in docs/solutions/
- Every automation (cron, webhook, scheduled job) is registered in docs/automations/registry.json and checks in to the watchdog; new automations follow /soloship:cron add mode (register -> deploy -> wire -> observe)

## Key Files

| File | Purpose |
|------|---------|
| AGENTS.md | Codex project guidance |
| CLAUDE.md | Claude Code project guidance |
| CHANGELOG.md | Version history |
| docs/SOLUTION_GUIDE.md | Schema for solution docs |

## Workflow

This project follows: THINK -> PLAN -> WORK -> LEARN -> SHIP.

- Think: use Soloship brainstorm/spec skills for new work.
- Plan: write plans to \`docs/plans/YYYY-MM-DD-<slug>.md\`.
- Work: implement from the latest approved plan.
- Learn: write solution docs for non-obvious fixes.
- Ship: run the appropriate Soloship shipping workflow.

## Rules

Coding conventions and workflow rules auto-load from \`.codex/rules/\`. The important project-wide rule is **browser-qa-gate**: no user-facing change is done until the affected flow has been exercised in a real browser, any issue found has been fixed, and the flow has been re-run successfully. If a flow needs login, use the default test account documented at \`docs/testing/test-accounts.md\`; if that file is missing, stop and ask to create a test account before claiming the flow is verified. Browser selection and end-of-QA cleanup follow **browser-tooling-priority**: Soloship's \`/browse\` daemon first, Claude in Chrome (the extension in the user's own Chrome, with the 1Password credential flow) second, the host app's built-in browser last — and when QA ends, close the browser tabs/sessions you opened so the next session doesn't find the browser held by a dead one.

Claude Code uses \`CLAUDE.md\`, \`.claude/rules/\`, and \`.claude/settings.local.json\`. Codex uses this file and \`.codex/rules/\`.

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

export function generateAutomationRegistry(): string {
  return `{
  "$comment": "Soloship automation registry — the single source of truth for every automation this project owns (cron jobs, scheduled workers, local launchd/crontab jobs, webhook receivers). Manage with /soloship:cron. Each entry: name, kind (cloud-cron|local-launchd|local-crontab|webhook|ci-schedule), description (optional but recommended — one plain-English sentence: what it does and why it matters; surfaced wherever humans look at automations, e.g. status endpoints, alert emails, dashboards), runsOn, checkin (sync_log|heartbeat), maxSilenceMinutes (~3x expected cadence, floor 60; ~1800 for daily jobs on a machine that sleeps; long activity windows for webhooks), troubleshoot (file paths / docs). statusEndpoint: the watchdog status API, when one exists.",
  "statusEndpoint": null,
  "automations": []
}
`;
}

export function generateAutomationsReadme(): string {
  return `# Automations — Registry + Watchdog

\`registry.json\` in this directory is the single source of truth for every
automation this project owns — cloud cron jobs, scheduled workers, local
launchd/crontab jobs, and webhook receivers. Manage it with \`/soloship:cron\`.

## The contract (enforced by the automation-registry rule)

- **No automation ships without a registry entry and an observed first
  check-in.** Register -> deploy -> wire -> observe, in that order
  (\`/soloship:cron\` add mode walks it).
- **Retiring an automation removes its entry** — a registered-but-deleted
  job alerts forever.
- **One watchdog.** Never build a per-job watchdog; add the job to this
  registry instead. Every automation checks in on SUCCESS (dead-man's
  switch); the watchdog alerts on the absence of good news, because dead
  jobs throw no errors.
- **Give each entry a \`description\`** (optional but recommended): one
  plain-English sentence — what it does and why it matters. It's what
  humans see on status endpoints, alert emails, and dashboards.

## Threshold rule of thumb

\`maxSilenceMinutes = 3x expected cadence\`, floor 60. Daily jobs on a
machine that sleeps get ~1800 (30h). Webhooks have no cadence — they get
expected-activity windows and a baseline check-in seeded at wiring time.
`;
}
