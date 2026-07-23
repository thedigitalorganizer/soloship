# Soloship

> Ship solo, safely.

Soloship is guardrails for non-coders building software through AI agents. It supports Claude Code and Codex: **mechanical enforcement** that fires automatically (18 hook protections, 15 always-on rules, and CI checks, no judgment calls required), **46 workflow skills** drawn from Soloship's own work plus five best-in-class upstream projects (Compound Engineering, Superpowers, Impeccable, gstack, ui-ux-pro-max, full attribution below), each with enforcement gates and anti-rationalization tables so the agent can't cut corners, and **a one-command setup** that detects your stack and wires guardrails into the project.

Everything ships inside the one Soloship plugin. Nothing depends on other plugins being installed.

**Quick reference:** [aifoundationlevels.com/soloship-cheatsheet](https://aifoundationlevels.com/soloship-cheatsheet)

## Install

### Prerequisites

You need the agent you want to use and Node.js 20 or newer:

- **Codex** for the Codex plugin surface.
- **[Claude Code](https://claude.com/claude-code)** for the Claude plugin surface.
- **Node.js 20+** for `npx soloship init`, `upgrade`, `doctor`, and `rollback`.

You don't need to install anything from npm by hand. `npx` downloads `soloship` on demand and caches it. Soloship is [live on npm](https://www.npmjs.com/package/soloship), verify with `npm view soloship`.

### How Soloship Is Structured

| Surface | What it gives you | Install/update owner |
|---|---|---|
| **Codex plugin** | Soloship skills for audit, bootstrap, plan, implement, review, browse, and ship workflows | `codex plugin ...` |
| **Claude Code plugin** | `/soloship:*` slash commands backed by the same `skills/` source tree | `/plugin ...` in Claude Code |
| **npm CLI** | Project guardrails: docs, rules, Claude hooks, CI, rollback stamp | `npx soloship ...` |

Use the plugin for daily workflow. Use the npm CLI once per project, then again when guardrails need refreshing.

### Choose Your Setup

Use one of these paths.

**Codex only**, if you work in the Codex app or Codex CLI:

```bash
codex plugin marketplace add thedigitalorganizer/soloship
codex plugin add soloship@soloship
npx soloship init --agent codex
```

Start a new Codex thread after the plugin install. The project setup creates `AGENTS.md` and `.codex/rules/`; it does not create Claude hooks.

**Claude Code only**, if you only work in Claude Code:

```text
/plugin marketplace add thedigitalorganizer/soloship
/plugin install soloship@soloship
```

Then set up each project:

```bash
npx soloship init --agent claude
```

This creates `CLAUDE.md`, `.claude/rules/`, and `.claude/settings.local.json`.

**Both Codex and Claude Code**, if you switch between them:

```bash
codex plugin marketplace add thedigitalorganizer/soloship
codex plugin add soloship@soloship
```

```text
/plugin marketplace add thedigitalorganizer/soloship
/plugin install soloship@soloship
```

Then set up each project once:

```bash
npx soloship init --agent both
```

Both agents use the same `skills/` source and the same `docs/plans/` and `docs/solutions/` project artifacts. Claude Code gets `.claude/` hooks/rules; Codex gets `.codex/rules/` and `AGENTS.md`.

### Codex Plugin

Add the Soloship marketplace, then install the plugin:

```bash
codex plugin marketplace add thedigitalorganizer/soloship
codex plugin add soloship@soloship
```

Start a new Codex thread after installing or updating so Codex loads the refreshed skills.

### Claude Code Plugin

Inside Claude Code, run these one at a time:

```text
/plugin marketplace add thedigitalorganizer/soloship
/plugin install soloship@soloship
```

Once installed, every `/soloship:*` slash command is available in Claude Code.

### Project Guardrails

Open the project you want to use Soloship in and run one setup path.

For Codex:

```bash
npx soloship init --agent codex
```

For Claude Code:

```bash
npx soloship init --agent claude
```

For both:

```bash
npx soloship init --agent both
```

`init` creates the documentation structure, 15 workflow rules, CI checks, the automation registry scaffold, the `.soloship/version` stamp, and the right agent-facing guidance. Claude installs hooks under `.claude/settings.local.json`; Codex installs rules under `.codex/rules/` and uses `AGENTS.md`. Codex hooks are intentionally not ported yet; they wait on verified Codex hook payloads.

For an existing codebase, run Soloship audit before bootstrap/setup so the guardrails match the code instead of guessing. In Claude Code, use `/soloship:audit`; in Codex, invoke the Soloship audit skill.

### Keeping Soloship Up To Date

Update each surface separately:

```bash
# Project guardrails
npx soloship upgrade --agent codex
npx soloship upgrade --agent claude
npx soloship upgrade --agent both

# Codex plugin
codex plugin marketplace upgrade soloship
codex plugin add soloship@soloship

# Claude Code plugin
/plugin update soloship@soloship
```

For local Codex dogfooding while developing this repo:

```bash
npm run codex:sync-local
codex plugin add soloship@personal
```

Start a new Codex thread after any plugin reinstall.

### Switching Between Claude Code And Codex

Both agents use the same repo, the same `skills/` source tree, and the same plan/solution artifacts under `docs/`. Claude Code reads `CLAUDE.md`, `.claude/rules/`, and `.claude/settings.local.json`. Codex reads `AGENTS.md` and `.codex/rules/`. Claude uses `/soloship:*`; Codex uses the installed Soloship plugin skills.

## Where Soloship came from

Soloship didn't start as a project. It started as a frustration.

I had 40+ solution documents in `docs/solutions/`: real fixes to real problems I'd hit before. The kind of knowledge that should prevent making the same mistake twice. But the agents kept making the same mistakes. I finally stopped and asked why.

The answer: none of the tools in my stack were reading the solutions at the point of execution. [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin)'s planning workflow dispatches a `learnings-researcher` agent that searches `docs/solutions/`, but it runs once, during the research phase, and its results get compressed into a few bullet points in the plan doc. The execution workflow never touches the solutions directory. It reads the plan, follows the plan, and trusts the plan to carry everything forward. With 40+ solution docs, most get scored out during the research pass. What survives is a summary of a summary. And once execution starts, there's no retrieval, even when the agent is hitting the exact error a solution doc describes.

So I tried **rules**: a `solution-search` rule that told the agent to check solutions before planning, debugging, or reviewing. It helped, when the agent followed it. But rules are suggestions. The agent would rationalize past them: "this is a simple change, no need to search." I'd ask if the rules were followed, and the honest answer was usually no.

So I tried **hooks**: mechanical triggers that fire regardless of what the agent is paying attention to. Hooks can't be rationalized away. That worked better. But wiring up hooks, rules, solution docs, `AGENTS.md` files, and CI checks for each new project was its own overhead.

And the workflow skills I was using weren't quite right either. [gstack](https://github.com/garrytan/gstack) has a strong skill set (QA, design review, security, shipping), but its skills are verbose and try to cover too much surface area. The agent would get lost in instruction volume, or the skill would prescribe steps that didn't apply to a solo operator's workflow. So I started pulling the good parts out and writing leaner versions: opinionated for the solo use case, with enforcement gates and solution-search wired in from the start. The skills worth keeping as-is got vendored directly into Soloship with full attribution, so one plugin install carries everything and nothing breaks when an upstream plugin isn't installed.

That became Soloship.

## How it works

Three layers, from most mechanical to most guided:

**Hooks** fire automatically in Claude Code sessions. They can't be rationalized away. Dangerous command blocking, security scanning on commits, auto-lint, CHANGELOG enforcement, plan validation, deploy discipline, the billing and recurrence gates, session presence for parallel agents, checkpoint commits, and a reply timestamp on every response so session logs can reconstruct when work actually happened. If the agent forgets, the hook remembers. Codex hook parity is intentionally deferred until Codex hook payloads are verified.

**Rules** are injected into every agent session as always-on context. Solution search before planning, plan materialization after plan mode, plan rationale and claim-verification requirements, plan lifecycle enforcement, a QA plan in every plan, the billing-confirmation and recurrence gates, parameterize-constants, deploy-from-main-only, the automation registry, and a **browser-QA gate that blocks "done" until the change has been exercised in a real browser** (with a test account where a flow needs login). The agent can't not see them, even if a skill doesn't reference them.

**Skills** are guided workflows. Claude Code exposes them as `/soloship:*` commands; Codex exposes them through the installed Soloship plugin. Each adds enforcement gates (checklists the agent must complete) and anti-rationalization tables (preemptive counters to the ways agents cut corners).

### Skill architecture

Every one of the 46 skills ships inside the Soloship plugin. Earlier versions routed to external plugins (Superpowers, Compound Engineering, gstack) when they were installed; that design was retired in v0.5.0. The curated set is now vendored directly into Soloship, so there are no external plugin dependencies and no broken dispatches for users who only install Soloship.

Skills come in three kinds:

**Soloship-native (18)**: the logic was written for Soloship. `audit`, `bootstrap`, `brainstorm`, `cleanup`, `cron`, `debug`, `design-review`, `finish`, `grill-me`, `implement`, `learn`, `onboard`, `plan`, `review`, `shipfast`, `shipthorough`, `spec`, `status`. Several of these embed methodology adapted from the upstream projects (for example, `plan` runs a Compound-Engineering-derived plan-writing flow and `debug` runs the Superpowers 4-phase discipline), with Soloship's enforcement gates layered on top.

**Vendored review and design (15)**: the gstack plan-review set (`ceo-review`, `eng-review`, `devex-review`, `plan-design-review`, `autoplan`), the Compound Engineering review set (`code-review`, `deepen-plan`, `document-review`), the Impeccable design set (`clarify`, `critique`, `polish`, `simplify`, `frontend-design`, `ui-audit`), and `ui-ux-pro-max`.

**Vendored discipline and utilities (12)**: the Superpowers discipline skills (`executing-plans`, `subagent-driven-development`, `test-driven-development`, `using-git-worktrees`, `verification-before-completion`, `writing-plans`) and the gstack standalones (`browse`, `qa`, `cso`, `context-save`, `context-restore`, `office-hours`).

All 45 are invoked the same way: `/soloship:<name>`. Source attribution lives in each skill's header and in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## What you get

### What bootstrap installs into your project

When you run `/soloship:bootstrap` (or `/soloship:audit` then `/soloship:bootstrap` on an existing project), it detects your language, framework, and package manager, then installs:

- **Folder scaffolding**: `docs/plans/`, `docs/solutions/`, `docs/audit/`, `docs/automations/` (the automation registry), `AGENTS.md` stubs
- **17 Claude Code hook protections** across four events. PreToolUse: dangerous command blocking, phone-a-friend warnings, Semgrep security scan on commits, deploy-freshness gate, deploy-discipline gate, billing-confirmation gate, recurrence gate, plan-completeness gate (every plan must declare an observable Goal + Done-When). PostToolUse: auto-lint, CHANGELOG check, recurrence audit, session heartbeat. Stop: plan validation, workflow navigator, handoff reminder, and a reply timestamp (so session logs can reconstruct when work actually happened). SessionStart: checkpoint commit, update check, session presence.
- **15 workflow rules**: solution search, plan materialization, plan rationale, plan lifecycle, plan artifact lifecycle, claim verification, QA plan in plans, billing confirmation, live-data evidence, recurrence, parameterized constants, browser QA gate, deploy-from-main-only, automation registry, component reuse
- **GitHub Actions CI** with architecture fitness functions
- **Generated docs**: `CLAUDE.md`, `AGENTS.md`, `CHANGELOG`, `SOLUTION_GUIDE`, sized to your stack

Run bootstrap once per project. For existing code, run `/soloship:audit` first so bootstrap can tailor the setup.

### The skills

**18 Soloship workflow skills** invoked as `/soloship:*` slash commands. Each one handles orchestration, enforcement, and artifact contracts. One of the 18 (`/finish`) is a faithful vendor of a Superpowers skill, renamed to fit the Soloship slash-command surface.

**Setup & orientation**

- `/soloship:audit`: Deep 2-phase codebase investigation. Phase 1 launches 4 parallel agents to map architecture, conventions, decisions, and infrastructure. Phase 2 launches 7 more to assess quality, entanglement, security, dependencies, gaps, leverage points, and the automation surface (every cron, webhook, and scheduled job plus its monitoring state). Human checkpoint between phases prevents building assessment on wrong assumptions. Produces `docs/audit/AUDIT-YYYY-MM-DD.md` + `audit-findings.json`.
- `/soloship:bootstrap`: Configures governance from audit findings or interactive questions. Creates CLAUDE.md and/or AGENTS.md guidance, installs the 15 workflow rules, seeds the automation registry, and wires up Claude hooks when Claude is targeted. Never overwrites existing files. Anti-rationalization table blocks "I'll set up governance later."
- `/soloship:onboard`: Reads CLAUDE.md, AGENTS.md, audit reports, and recent git history to produce a 7-section orientation briefing. Flags stale audit reports. Fully self-contained.

**Daily work**

- `/soloship:brainstorm`: Feature exploration that merges Compound Engineering's brainstorm methodology with Superpowers' brainstorming discipline. Ends with a mandatory design-first nudge: sketch before you plan. For demand-validation questions (should this exist?), use `/soloship:office-hours` instead.
- `/soloship:grill-me`: Relentless pre-plan interview that walks every branch of the design tree until user and agent share a complete mental model. Refuses to produce a plan or any code until alignment is explicit. Triggered explicitly ("grill me", "interview me") or by `/soloship:plan` on medium-to-large work. Adapted from Matt Pocock's `grill-me` (MIT).
- `/soloship:spec`: Writes formal specifications with numbered acceptance criteria, data models, API contracts, user flows (including error states), and explicit out-of-scope boundaries. 8-point verification checklist. Fully self-contained.
- `/soloship:plan`: Searches `docs/solutions/` for prior art, reads architecture context, then runs the Compound-Engineering-derived plan-writing methodology. Every plan must include a QA Plan section with the verification method matched to each touched surface. The enforcement gate validates: Why lines, Key Decisions, Execution Strategy, Handoff section, QA Plan, no unaddressed pitfalls, and that non-trivial work was preceded by `/soloship:grill-me`. Review is separate, handled by `/soloship:review`.
- `/soloship:implement`: Finds the most recent plan in `docs/plans/`, claims it (so parallel sessions don't double-work it), sets up an isolated worktree, then runs the Compound-Engineering-derived execution methodology with branching and quality checks. Freshness check warns on stale plans. **A mandatory QA Gate (Step 2.6) executes every row of the plan's QA Plan before completion, and browser QA via `/soloship:browse` is required for any user-facing flow, with a test account where a flow needs login.** **Defaults to a local merge into the base branch** when execution finishes; it does not auto-create a GitHub PR. Ask explicitly ("open a PR for this") or use `/soloship:finish` Option 2 if you want one.
- `/soloship:debug`: Iron law: no fixes without root cause investigation. Searches solutions for prior art first, then runs the Superpowers-derived 4-phase discipline (Investigate, Analyze, Hypothesize, Implement). Nudges `/soloship:learn` for non-obvious fixes.
- `/soloship:learn`: Captures knowledge from non-obvious work. Runs the Compound-Engineering-derived compound methodology to write a solution doc. Adds Soloship protocols: JSONL logging for cross-session search, architecture registry drift checking, and distributed AGENTS.md propagation (pitfalls into existing AGENTS.md files, new ones for directories above the 3-file governance threshold). Anti-rationalization table blocks "this fix was straightforward, not worth documenting."
- `/soloship:cleanup`: Knowledge system maintenance. Launches 5 parallel audit agents (solution health, overlap detection, plan lifecycle, AGENTS.md staleness, index sync), presents findings interactively, then executes approved changes in a single atomic commit. Merge candidates require 2-of-3 signal threshold.
- `/soloship:component-inventory`: Scans the codebase for UI components (React/Vue/Svelte) and generates `docs/architecture/COMPONENTS.md` — name, file, purpose, props, and usage sites per component, plus a "Possible duplicates" section the user decides on. Delta-updates an existing inventory (unchanged rows are preserved byte-for-byte, so a no-change re-run produces no diff). The data source behind the `component-reuse` rule and the duplicate-component warn hook.

**Operations**

- `/soloship:status`: One read-only dashboard for "what's going on in this project": active agent sessions (who's working where), the plan board (every plan by status with progress), and deploy state (what's live vs what's merged and waiting).
- `/soloship:cron`: The management console for every automation a project owns (cron jobs, scheduled workers, local launchd/crontab jobs, webhooks). Reads the automation registry, queries the watchdog, live-discovers unregistered jobs, troubleshoots anything dark, and enforces the build-time contract for new automations: register, deploy, wire the check-in, observe the first check-in.

**Shipping**

- `/soloship:finish`: When implementation is done, all tests pass, and you need to decide how to integrate the work. Walks the merge / PR / cleanup options with a structured decision tree. Faithful vendor of Superpowers' `finishing-a-development-branch` skill, renamed for the Soloship slash surface.
- `/soloship:shipfast`: Emergency deploy pipeline. Lint (with auto-fix tolerance), test (pre-existing failures allowed), build (must pass), commit, push, deploy. Auto-detects platform. Even shipfast shows the deploy manifest and asks once. Minimum viable safety, maximum speed.
- `/soloship:shipthorough`: Full due diligence: preflight checks, base branch merge, lint, test, inline quality gate (TypeScript + linter + dead code + shellcheck), coverage audit, 3-pass code review (via `/review`), registry update, CHANGELOG enforcement, plan lifecycle cleanup, bisectable commits, **local merge into the base branch and push** (PR only on explicit opt-in), verification gate, deploy.

**Quality**

- `/soloship:review`: Detects whether the target is a plan or code. **Plans** go to `eng-review`, `ceo-review`, `plan-design-review` individually, or `autoplan` for all four (adds DX review) in one auto-decided pass. **Code** goes to `code-review` for PR-scale multi-agent analysis, or three inline passes (structural, adversarial, design slop lens) for quick local checks.
- `/soloship:design-review`: Two-pass visual audit. Pass 1 covers spacing, hierarchy, and consistency (gstack-derived). Pass 2 is Soloship's own AI slop detection (inspired by Impeccable): flags generic gradients, default shadows, "Welcome to" copy, 3-column feature grids, and other patterns that mark AI-generated design. Each fix committed atomically with before/after screenshots.

**Plus 27 vendored skills** invoked the same way: `/soloship:browse` (headless browser for QA), `/soloship:qa`, `/soloship:autoplan`, `/soloship:cso`, `/soloship:context-save` / `/soloship:context-restore`, `/soloship:office-hours`, the four plan-review skills, the CE review set, the Impeccable design set, the Superpowers discipline set, and `/soloship:ui-ux-pro-max`. See [Skill architecture](#skill-architecture) for the full breakdown.

## Quick start

See the [Install](#install) section above for the Codex and Claude install commands. Once installed, the daily flow inside any project is:

**New project:**

```
/soloship:bootstrap                           # set up the guardrails
/soloship:brainstorm → /soloship:plan → /soloship:implement
```

**Existing project:**

```
/soloship:audit                               # understand what's there first
/soloship:bootstrap                           # set up guardrails tailored to what audit found
/soloship:plan → /soloship:implement → /soloship:shipthorough
```

### Running the npm CLI directly

`/soloship:bootstrap` calls `npx soloship init` under the hood, so you don't usually need to think about the npm CLI. But it's there if you want to script setup, run it in CI, or skip the slash command entirely. Run any of these from your project root:

```bash
npx soloship init --agent both   # initial setup: creates docs, rules, CI, AGENTS.md, and Claude hooks
npx soloship upgrade     # refresh hooks, rules, and the .soloship/version stamp
npx soloship doctor      # check Claude Code, Codex, and project guardrail status
npx soloship rollback    # restore the last safety snapshot
```

`npx` auto-downloads the latest Soloship from npm the first time you run it, and caches it after that. There's no separate `npm install -g` step.

## Design decisions

1. **Audit before bootstrap on existing projects.** Don't impose governance on a codebase you haven't understood yet.
2. **Design-first principle.** `/soloship:brainstorm` nudges you toward visual design before `/soloship:plan`. Design catches problems text can't.
3. **Hooks for enforcement, skills for intelligence.** Hooks are mechanical and fire automatically. Skills are guided and require judgment. Rules sit underneath both; they're always on, even when the skill forgets.
4. **npm installer + Claude Code + Codex plugins.** Installer handles one-time infrastructure. Shared skills handle daily workflow. Different jobs, different tools.
5. **Vendored, not dependent.** Where [Superpowers](https://github.com/obra/superpowers), [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin), or [gstack](https://github.com/garrytan/gstack) already do the job well, Soloship vendors the skill (with attribution and version pins) and adds enforcement gates and solo-operator defaults on top. One plugin install carries everything; nothing breaks when an upstream plugin isn't installed. Upstream refreshes are pulled in deliberately, not automatically.

## Status

| Phase | Status | What it delivered |
|-------|--------|-------------------|
| 1-2 | Done | Cleanup + `npx soloship init` with stack detection |
| 3-4 | Done | `/audit` + `/bootstrap` skills |
| 5-6 | Done | The initial skill set + hooks + rules |
| 7 | Partially done | The safety floor shipped (Semgrep security scanning, checkpoint/rollback, phone-a-friend warnings). Surface simplification has not started. |
| 8 | Not started | Graduation system, methodology documentation |

Since the phase plan was written, releases 0.5 through 0.13 also vendored the full 45-skill set into the plugin, added Codex support, the browser QA gate, the QA-plan requirement, deploy discipline (deploy-from-main-only, the deploy lock, the `prod` tag), cross-session coordination for parallel agents, and the automation registry with its one-watchdog standard. See [`CHANGELOG.md`](CHANGELOG.md) for the full history. Phase 8's graduation system (calibrated thresholds that tell you when your project has outgrown solo mode) remains open.

## Built on the shoulders of

Soloship curates and vendors skills from five outstanding Claude Code plugin ecosystems. One Soloship plugin install per host gives users the curated set; full credit and install links for the authors stay here. Full attribution and version pins live in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

[**Compound Engineering**](https://github.com/EveryInc/compound-engineering-plugin), Kieran Klaassen (Every). The brainstorm, plan, work, compound loop is the spine of how Soloship thinks about engineering. `/review` inherits CE's multi-agent review pattern.

[**Superpowers**](https://github.com/obra/superpowers), Jesse Vincent. The discipline skills: `systematic-debugging`'s "no fixes without root cause," `verification-before-completion`'s "evidence before claims," `test-driven-development`, `writing-plans`, `executing-plans`, `subagent-driven-development`, `using-git-worktrees`, `finishing-a-development-branch` (renamed to `finish` in Soloship, invoke via `/soloship:finish`), and `brainstorming`. Nine skills total.

[**Impeccable**](https://impeccable.style), Paul Bakaus (extending Anthropic's original `frontend-design`). Design vocabulary and steering commands that let non-coders ship work that doesn't look AI-generated. Soloship vendors `frontend-design` and five `/i-*` commands; 12 more are in the full plugin.

[**ui-ux-pro-max**](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), nextlevelbuilder. The design reference library: styles, palettes, font pairings, UX guidelines, chart patterns, across every stack the agent might target.

[**gstack**](https://github.com/garrytan/gstack), Garry Tan (YC). The solo builder toolkit. Soloship vendors 12 of the most non-coder-friendly skills: `autoplan` (chains CEO + design + eng + DX reviews), `context-save` / `context-restore` (the checkpoint pair), `browse` (headless browser daemon, re-vendored with Soloship-native paths so it works standalone), `qa`, `design-review`, the four plan-review skills (eng, ceo, design, devex), `office-hours`, and `cso`. Full gstack has ~25 more.

If any of these are useful to you, please install the full upstream plugin. Each `THIRD_PARTY_NOTICES.md` section has the one-line install command, and you'll get everything the author built, not just Soloship's selection.

Also influential but not vendored:

[**intent-layer**](https://github.com/crafter-station/skills/tree/main/context-engineering/intent-layer) (crafter-station/skills, built on [The Intent Layer](https://www.intent-systems.com/learn/intent-layer) by Tyler Brandt). `/learn` Steps 4-5 adapt the concept of distributed per-directory `AGENTS.md` files for codebase navigation. Soloship's version is continuous (updates on every `/learn` pass, not one-shot), threshold-gated (3+ source files before creating), append-only with dated attribution, and scoped to solution-doc evidence rather than speculative. `/bootstrap` and `/cleanup` also maintain the AGENTS.md network.

[**Serena**](https://github.com/oraios/serena), symbol-level LSP code navigation. Optional. Worth adding once a codebase outgrows file-level tools; see Serena's README for install instructions.

The broader design traces back to a research pass across: Ousterhout on strategic vs tactical programming (you are the architect, the agent implements), Hickey on simple vs easy, Metz on dependency awareness and sizing rules, Meadows on leverage points in systems, the BCG "AI Brain Fry" finding that productivity drops past three tools, Kathy Sierra on the collapse zone (only automated process survives when things break), and the Codified Context paper that validated the CLAUDE.md + AGENTS.md + docs/ three-tier pattern.

## Repo layout

```
.claude-plugin/        # Claude Code plugin manifest (plugin.json, marketplace.json)
.codex-plugin/         # Codex plugin manifest
.agents/plugins/       # Codex marketplace entry
bin/soloship.js        # CLI entry point
src/                   # TypeScript source for the installer
  cli.ts               # Commander CLI definition
  init.ts              # Main init orchestration
  detect.ts            # Stack detection
  scaffold.ts          # Folder + doc creation
  hooks.ts             # Claude Code hook configuration
  rules.ts             # Claude and Codex workflow rule installation
  ci.ts                # GitHub Actions + architecture fitness
  templates.ts         # CLAUDE.md / AGENTS.md / CHANGELOG / SOLUTION_GUIDE generators
skills/                # Shared Claude Code and Codex skills shipped by the plugins (45 total)
  # All skills are invoked as /soloship:<name>. Source attribution lives
  # in THIRD_PARTY_NOTICES.md; no source prefixes leak into command names.

  # Soloship-native workflow skills (18):
  audit/ bootstrap/ brainstorm/ cleanup/ cron/ debug/ design-review/
  finish/ grill-me/ implement/ learn/ onboard/ plan/ review/
  shipfast/ shipthorough/ spec/ status/

  # Plan-review skills, derived from gstack (5):
  ceo-review/ eng-review/ devex-review/ plan-design-review/ autoplan/

  # Code-review, design, and frontend skills, derived from CE and Impeccable (8):
  code-review/ deepen-plan/ document-review/ clarify/ critique/
  polish/ simplify/ frontend-design/

  # Discipline skills, derived from Superpowers (6):
  executing-plans/ subagent-driven-development/ test-driven-development/
  using-git-worktrees/ verification-before-completion/ writing-plans/

  # Standalone vendored utilities (8):
  browse/             # gstack's headless browser daemon, re-vendored with
                      # Soloship-native paths so it works without gstack
                      # installed. Compiles its launcher on first use
                      # (build-on-host for arm64/x86_64 portability).
  cso/ qa/ context-save/ context-restore/ office-hours/   # from gstack
  ui-audit/                                               # from Impeccable
  ui-ux-pro-max/                                          # from nextlevelbuilder

  references/          # Shared checklists (a11y, code review, perf, security, testing)
  vendored/            # Per-source LICENSE / NOTICE / VERSION / README (attribution archive)
```

## License

MIT.

## A note to anyone reading this

Soloship is opinionated and unfinished. It's the working toolkit of one person who builds software through AI agents and is trying to do it responsibly. If you find it useful, great. If you think a decision is wrong, open an issue. The adversarial-review phase of this project already taught me that the things I'm most confident about are the things most likely to need a second pair of eyes.
