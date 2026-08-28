import type { ProjectInfo } from "./detect.js";
import {
  ALWAYS_REQUIRED_FIELDS,
  BUG_TRACK_PROBLEM_TYPES,
  BUG_TRACK_REQUIRED_FIELDS,
  EXAMPLE_CATEGORIES,
  KNOWLEDGE_TRACK_PROBLEM_TYPES,
  OPTIONAL_FIELDS,
  RESOLUTION_TYPE_ENUM,
  ROOT_CAUSE_ENUM,
  schemaVersionMarker,
} from "./solution-schema.js";
import { ensureSafetyGatesSection, renderSafetyGatesSection } from "./safety-gates.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Copied into new-project AGENTS.md/CLAUDE.md. Keep short — it is always-on context. */
export const LOAD_BEARING_WORK =
  "billing/credit, live customer or financial data, production deploy, auth, or schema/migrations";

export const DEFAULT_WORK_PATH = `## Default path

Do the work. Always-on gates still apply.

Use \`/soloship:plan\`, \`/soloship:grill-me\`, \`/soloship:review\`, \`/soloship:autoplan\`, \`/soloship:implement\`, \`/soloship:deepen-plan\`, and \`/soloship:shipthorough\` only when the user asked for that skill, or the work is load-bearing: ${LOAD_BEARING_WORK}.

Do not chain those skills as a default pipeline.`;

// Phase 3 of docs/plans/2026-08-27-one-source-of-truth-across-agent-hosts.md:
// AGENTS.md became what CLAUDE.md used to be (the fat instruction file) and
// CLAUDE.md became an import. Four of five hosts read AGENTS.md natively
// (Cursor, Codex, Antigravity root-only, Grok); Claude Code is the only one
// that does not, and Anthropic's own docs supply the bridge — a CLAUDE.md
// whose first line is `@AGENTS.md`. Verified live against
// code.claude.com/docs/en/memory, 2026-08-27: "Claude loads the imported
// file at session start, then appends the rest" — exactly the shape used
// below. This import resolves inside the project root (same directory as
// CLAUDE.md), so it is never treated as an "external" import and never
// triggers Claude Code's external-import approval dialog.
export function generateClaudeMd(_project: ProjectInfo): string {
  return `@AGENTS.md

## Claude Code

This import pulls in the entire project instruction set above, including
the Safety gates section — nothing here duplicates it. What's genuinely
Claude-specific:

- Hooks (dangerous-command blocking, billing/deploy/recurrence/plan gates,
  session coordination) live in \`.claude/settings.local.json\`, not in
  AGENTS.md — that file is gitignored per-checkout by design.
- Project rule directories under \`.claude/\` no longer carry Soloship's
  safety-gate rules (moved into AGENTS.md above); a \`.claude/rules/\`
  directory that still exists holds only rules you authored yourself.
`;
}

export function generateAgentsMd(project: ProjectInfo): string {
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

  return `# AGENTS.md — ${project.name}

${project.description ? `${project.description}\n\n` : ""}${stackLine ? `**Stack:** ${stackLine}\n` : ""}
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

**Before modifying code in a subdirectory, read its AGENTS.md first.** Nested
AGENTS.md files keep the Scope/Owns/Contracts/Key-Files schema this root file
no longer carries — that schema restates the file it's written in when used
at the root, but at each subdirectory it's real information nothing else has.

## Cross-Cutting Contracts

<!-- TODO: Run /audit to discover cross-cutting contracts -->

## Global Invariants

<!-- TODO: Add project-specific invariants discovered by /audit -->

${DEFAULT_WORK_PATH}

When a plan is warranted, write it to \`docs/plans/YYYY-MM-DD-<slug>.md\`. After a non-obvious fix, write a solution doc (\`/soloship:learn\`). Ship to production only when the user asks (\`/soloship:shipfast\` for a hotfix, \`/soloship:shipthorough\` for a thorough production go-live).

## Rules

Coding conventions live in this file and in package-level AGENTS.md files.
The seven always-on safety gates below apply regardless of what else this
file says.

- Name repeated or business/config values; leave one-shot literals inline.
- Search for an existing UI component before creating one; extract a shared component on the third use.
- Before planning or debugging, search \`docs/solutions/\` for prior art.
- Plans live in \`docs/plans/\` with status frontmatter (\`planned\` / \`in-progress\` / \`blocked\` / \`done\` / \`abandoned\` / \`superseded\`), \`## Goal\`, \`## Done-When\`, a Why per phase, Key Decisions, and a QA Plan row per touched surface.
- No user-facing change is done until the affected flow has been exercised in a real browser. Isolated browser first (\`/soloship:browse\`); use the user's real browser only when a login is required. If a flow needs login, use the default test account at \`docs/testing/test-accounts.md\`; if that file is missing, stop and ask.
- Every automation is registered in \`docs/automations/registry.json\` and checks in.

## Agent Surfaces

| Host | Reads this file how |
|------|---------------------|
| Cursor | Natively — root and nested \`AGENTS.md\` |
| Codex | Natively — global + root-to-cwd nested, combined under a raised \`project_doc_max_bytes\` cap |
| Antigravity | Natively — root only; nested support unverified |
| Grok Build | Natively, plus its own and Cursor's rule/hook surfaces |
| Claude Code | Does not read this file directly — \`CLAUDE.md\` starts with \`@AGENTS.md\`, an import Claude Code expands into context in full at session start, plus a short Claude-only appendix |

${renderSafetyGatesSection()}

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
  const bulletList = (values: readonly string[]) =>
    values.map((value) => `- \`${value}\``).join("\n");
  const inlineList = (values: readonly string[]) =>
    values.map((value) => `\`${value}\``).join(", ");

  return `${schemaVersionMarker()}

# Solution Guide

## What Goes Here

Every non-obvious fix or significant feature produces a solution doc. These accumulate
in \`docs/solutions/<category>/\` and are searched before every planning session.

\`/soloship:learn\` writes these docs for you — this guide documents the schema it
produces, so a validator or a human editing a doc by hand has one thing to follow.

## Pick the track first

\`problem_type\` selects one of two tracks, and the track decides which fields are
**required**.

**Bug track** — you fixed something broken (an error, failure, regression, or
misbehavior):

${bulletList(BUG_TRACK_PROBLEM_TYPES)}

The bug track additionally requires ${inlineList(BUG_TRACK_REQUIRED_FIELDS)} — the
doc is useless to a future searcher without the observable symptom and the
underlying cause.

**Knowledge track** — durable guidance, a pattern, or a convention, with no single
broken thing:

${bulletList(KNOWLEDGE_TRACK_PROBLEM_TYPES)}

Here ${inlineList(BUG_TRACK_REQUIRED_FIELDS)} are **optional** — include them only
if a specific cause genuinely applies.

## Frontmatter

Required on every doc, both tracks: ${inlineList(ALWAYS_REQUIRED_FIELDS)}.
Optional: ${inlineList(OPTIONAL_FIELDS)}.

\`\`\`markdown
---
title: Short descriptive title
date: YYYY-MM-DD
problem_type: <selects the track — see above>
category: one-of-the-categories
components: [list, of, affected, components]
files: [list, of, key, files]
symptoms: [what, the, user, sees]       # required on the bug track
root_cause: <enum below>                # required on the bug track
resolution_type: <enum below>           # required on the bug track
error_messages: [exact, error, strings]
tags: [searchable, keywords]
---
\`\`\`

\`/soloship:learn\` also stamps \`producer\`, \`version\`, \`ttl_days\`, and a
\`content_hash\` — you do not write those by hand.

### \`root_cause\` enum

Why it broke. Pick the closest value — this is the searchable index, and the prose
in the body is what a reader actually needs.

${inlineList(ROOT_CAUSE_ENUM)}

### \`resolution_type\` enum

How it was fixed. Pick the closest value.

${inlineList(RESOLUTION_TYPE_ENUM)}

## Categories

Categories are an **open set** — they emerge from the solutions this project
actually accumulates. A project's real categories are whatever directories exist
under \`docs/solutions/\`. Create a new one whenever nothing fits.

Common starting points: ${inlineList(EXAMPLE_CATEGORIES)}.

> Anything that validates \`category\` must read the directories on disk rather
> than hardcoding this list. A previous version of this guide shipped a closed
> nine-item list; a downstream validator copied it verbatim and then rejected
> five legitimate categories, producing 133 false errors and training everyone
> to ignore it.

## Body

\`\`\`markdown
## Problem

What went wrong. Include error messages or reproduction steps.

## Solution

What was done to fix it. Always present.

## Why This Works

Required on the bug track: the root cause in prose, and why the fix addresses it.

## Prevention

How to stop this recurring. The most important section — rules, tests, or checks
that should be added.

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

/**
 * Fs-level counterpart to ensureSafetyGatesSection(): makes sure the
 * project's actual AGENTS.md on disk carries the current Safety gates
 * section, called from both `init` (an existing project's AGENTS.md is never
 * regenerated — scaffoldDocs skips it) and `upgrade` (which preserves
 * AGENTS.md by contract and would otherwise never touch it). Run this BEFORE
 * pruning the old generated rule-mirror directories: the prune's safety
 * argument is "the text still lives in AGENTS.md," which is only true once
 * this has run. Missing AGENTS.md entirely (a project that never ran `init`)
 * gets a full fresh file via generateAgentsMd(project), not just the section
 * — there's nothing else to preserve.
 */
export function ensureSafetyGatesInAgentsMd(
  root: string,
  project: ProjectInfo
): { path: string; action: "created" | "updated" | "unchanged" } {
  const path = join(root, "AGENTS.md");
  if (!existsSync(path)) {
    writeFileSync(path, generateAgentsMd(project));
    return { path: "AGENTS.md", action: "created" };
  }
  const current = readFileSync(path, "utf-8");
  const { content, changed } = ensureSafetyGatesSection(current);
  if (!changed) return { path: "AGENTS.md", action: "unchanged" };
  writeFileSync(path, content);
  return { path: "AGENTS.md", action: "updated" };
}
