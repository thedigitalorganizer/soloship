# Soloship

> Ship solo, safely.

Soloship is guardrails for non-coders building software through AI agents. It's a Claude Code plugin that gives you three things a traditional engineering team would: **mechanical enforcement** that fires automatically (9 hooks, 4 rules, CI checks — no judgment calls required), **19 workflow skills** that guide you through the steps a professional would take (each with enforcement gates and anti-rationalization tables so the agent can't cut corners), and **a one-command setup** that detects your stack and wires everything into the project.

**Quick reference:** [aifoundationlevels.com/soloship-cheatsheet](https://aifoundationlevels.com/soloship-cheatsheet)

## Install

Soloship is a [Claude Code](https://claude.com/claude-code) plugin. If you don't have Claude Code installed yet, install it first — then come back here.

Inside any Claude Code session, run these two commands:

```
/plugin marketplace add thedigitalorganizer/soloship
/plugin install soloship@soloship
```

That's it. The plugin installs globally, so you only do this once on your machine. All 19 Soloship commands are now available as `/soloship:*` slash commands in every project you open.

### Using Soloship in a project

Open the project you want to use Soloship in — a brand-new empty folder or an existing codebase, either works — then run one of these in Claude Code:

**Brand-new project (no code yet):**

```
/soloship:bootstrap
```

Bootstrap asks four questions about your project, then sets up the guardrails (hooks, rules, folder structure, `CLAUDE.md`). When it finishes, you're ready to build. Start your first feature with `/soloship:brainstorm`.

**Existing project (already has code):**

```
/soloship:audit
/soloship:bootstrap
```

`/soloship:audit` investigates the codebase first (it dispatches 10 parallel agents to map architecture, conventions, quality, and risk). `/soloship:bootstrap` then reads what audit found and tailors the setup to your actual code instead of guessing. Takes a few minutes, but it's what keeps the guardrails from fighting your existing conventions.

After bootstrap, the daily loop is `/soloship:brainstorm` → `/soloship:plan` → `/soloship:implement` → `/soloship:shipthorough`.

## How we got here

Soloship didn't start as a project. It started as a frustration.

We had 40+ solution documents in `docs/solutions/` — real fixes to real problems we'd hit before. The kind of knowledge that should prevent you from making the same mistake twice. But the agents kept making the same mistakes. We finally stopped and asked why.

The answer: none of the tools in our stack were reading the solutions at the point of execution. [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin)'s planning workflow dispatches a `learnings-researcher` agent that searches `docs/solutions/` — but it runs once, during the research phase, and its results get compressed into a few bullet points in the plan doc. The execution workflow never touches the solutions directory. It reads the plan, follows the plan, and trusts the plan to carry everything forward. With 40+ solution docs, most get scored out during the research pass. What survives is a summary of a summary. And once execution starts, there's no retrieval — even when the agent is hitting the exact error a solution doc describes.

So we tried **rules** — a `solution-search` rule that told the agent to check solutions before planning, debugging, or reviewing. It helped, when the agent followed it. But rules are suggestions. The agent would rationalize past them: "this is a simple change, no need to search." We'd ask if the rules were followed, and the honest answer was usually no.

So we tried **hooks** — mechanical triggers that fire regardless of what the agent is paying attention to. Hooks can't be rationalized away. That worked better. But wiring up hooks, rules, solution docs, `AGENTS.md` files, and CI checks for each new project was its own overhead.

And the workflow skills we were routing through weren't quite right either. [gstack](https://github.com/garrytan/gstack) has a strong skill set — QA, design review, security, shipping — but its skills are verbose and try to cover too much surface area. The agent would get lost in instruction volume, or the skill would prescribe steps that didn't apply to a solo operator's workflow. So we started pulling the good parts out and writing our own versions: leaner, opinionated for the solo use case, with enforcement gates and solution-search wired in from the start. Where the upstream tools already do the job well, Soloship routes to them and adds enforcement on top rather than rewriting them.

That became Soloship.

## How it works

Three layers, from most mechanical to most guided:

**Hooks** fire automatically on git events. They can't be rationalized away. Dangerous command blocking, security scanning, auto-lint, CHANGELOG enforcement, plan validation, architecture fitness functions. If the agent forgets, the hook remembers.

**Rules** are injected into every agent session as always-on context. Solution search before planning, plan materialization after plan mode, plan rationale requirements, plan lifecycle enforcement. The agent can't not see them, even if a skill doesn't reference them.

**Skills** are guided workflows invoked as `/soloship:*` commands. Each adds enforcement gates (checklists the agent must complete), anti-rationalization tables (preemptive counters to the ways agents cut corners), and routing to the right underlying tool.

### Skill architecture

Some skills are fully self-contained — the logic lives entirely in the SKILL.md:

| Skill | What it does |
|-------|-------------|
| `/audit` | 10 parallel investigation agents, two-phase with human checkpoint |
| `/bootstrap` | Reads audit findings, generates governance infrastructure |
| `/spec` | Formal specification with acceptance criteria |
| `/onboard` | Reads all project docs, produces orientation briefing |
| `/shipfast` | Lint → test → build → commit → push → deploy |
| `/cleanup` | 5 audit agents → interactive proposals → atomic execution |

Others are routers — Soloship adds enforcement and routing logic, then dispatches to an external skill:

| Skill | Routes to | What Soloship adds |
|-------|-----------|-------------------|
| `/brainstorm` | `office-hours` (product) / `superpowers:brainstorming` (technical) | Product-vs-technical routing, mandatory design-first nudge |
| `/plan` | `superpowers:writing-plans` / `plan-eng-review` | Solution search before planning, 7-point enforcement gate, artifact contracts |
| `/implement` | `superpowers:subagent-driven-development` / `superpowers:dispatching-parallel-agents` | Plan-first enforcement, execution strategy routing |
| `/debug` | `superpowers:systematic-debugging` | Solution search for prior art, root-cause iron law |
| `/learn` | `compound-engineering:workflows:compound` (Step 1) | Solution doc via CE, then own protocols: JSONL logging, registry audit, AGENTS.md propagation + creation |
| `/review` | `plan-eng/ceo/design-review` (plans) / 3-pass agents (code) | Target detection (plan vs code), severity classification, synthesis |
| `/shipthorough` | Invokes `/review` internally | 12-step pipeline: preflight, merge, lint, test, coverage audit, review, registry, CHANGELOG, plan lifecycle, commits, PR, deploy |
| `/qa` | gstack `qa` / `qa-only` | Mode selection (fix vs report-only) |
| `/security` | gstack `cso` | Post-audit triage routing |
| `/design-review` | gstack `design-review` | Adds AI slop detection pass (visual/content/layout patterns) |

## What you get

### What bootstrap installs into your project

When you run `/soloship:bootstrap` (or `/soloship:audit` → `/soloship:bootstrap` on an existing project), it detects your language, framework, and package manager, then installs:

- **Folder scaffolding** — `docs/plans/`, `docs/solutions/`, `docs/audit/`, `AGENTS.md` stubs
- **9 Claude Code hooks** — dangerous command blocking, security scanning, auto-lint, CHANGELOG check, plan validation, workflow navigator, handoff reminder, checkpoint/rollback, architecture fitness
- **4 workflow rules** — solution search, plan materialization, plan rationale, plan lifecycle
- **GitHub Actions CI** with architecture fitness functions
- **Generated docs** — `CLAUDE.md`, `AGENTS.md`, `CHANGELOG`, `SOLUTION_GUIDE`, sized to your stack

Run bootstrap once per project. For existing code, run `/soloship:audit` first so bootstrap can tailor the setup.

### The skills

19 Claude Code skills invoked as `/soloship:*` slash commands:

**Setup & orientation**

- `/soloship:audit` — Deep 2-phase codebase investigation. Phase 1 launches 4 parallel agents to map architecture, conventions, decisions, and infrastructure. Phase 2 launches 6 more to assess quality, entanglement, security, dependencies, gaps, and leverage points. Human checkpoint between phases prevents building assessment on wrong assumptions. Produces `docs/audit/AUDIT-YYYY-MM-DD.md` + `audit-findings.json`.
- `/soloship:bootstrap` — Configures governance from audit findings or interactive questions. Creates CLAUDE.md, AGENTS.md files (3+ source file threshold), installs 4 core rules, and wires up hooks. Never overwrites existing files. Anti-rationalization table blocks "I'll set up governance later."
- `/soloship:onboard` — Reads CLAUDE.md, AGENTS.md, audit reports, and recent git history to produce a 7-section orientation briefing. Flags stale audit reports. No external routing — fully self-contained.

**Daily work**

- `/soloship:brainstorm` — Detects whether the question is product (demand, audience, wedge) or technical (approaches, trade-offs) and routes accordingly: `office-hours` for product questions, `superpowers:brainstorming` for technical ones. Ends with a mandatory design-first nudge — sketch before you plan.
- `/soloship:spec` — Writes formal specifications with numbered acceptance criteria, data models, API contracts, user flows (including error states), and explicit out-of-scope boundaries. 8-point verification checklist. Fully self-contained.
- `/soloship:plan` — Searches `docs/solutions/` for prior art, reads architecture context, then routes to `superpowers:writing-plans` for standard features or `plan-eng-review` for architectural work. 7-point enforcement gate validates: Why lines, Key Decisions, Execution Strategy, Handoff section, no unaddressed pitfalls.
- `/soloship:implement` — Finds the most recent plan in `docs/plans/`, assesses the execution strategy, and routes to `superpowers:subagent-driven-development` (sequential tasks) or `superpowers:dispatching-parallel-agents` (independent modules). Freshness check warns on stale plans.
- `/soloship:debug` — Iron law: no fixes without root cause investigation. Searches solutions for prior art first, then routes to `superpowers:systematic-debugging` for 4-phase discipline (Investigate → Analyze → Hypothesize → Implement). Nudges `/learn` for non-obvious fixes.
- `/soloship:learn` — Captures knowledge from non-obvious work. Step 1 routes to `compound-engineering:workflows:compound` for solution doc creation. Steps 2-3 are Soloship's own protocols: JSONL logging for cross-session search and architecture registry drift checking. Steps 4-5 adapt the distributed AGENTS.md concept — propagating pitfalls into existing AGENTS.md files and creating new ones for directories above the 3-file governance threshold. Anti-rationalization table blocks "this fix was straightforward, not worth documenting."
- `/soloship:cleanup` — Knowledge system maintenance. Launches 5 parallel audit agents (solution health, overlap detection, plan lifecycle, AGENTS.md staleness, index sync), presents findings interactively, then executes approved changes in a single atomic commit. Merge candidates require 2-of-3 signal threshold. Each merge dispatched as an independent subagent to prevent context bloat.

**Shipping**

- `/soloship:shipfast` — Emergency deploy pipeline. Lint (with auto-fix tolerance), test (pre-existing failures allowed), build (must pass), commit, push, deploy. Auto-detects platform. Minimum viable safety, maximum speed.
- `/soloship:shipthorough` — Full due diligence: preflight checks, base branch merge, lint, test, coverage audit, 3-pass code review (via `/review`), registry update, CHANGELOG enforcement, plan lifecycle cleanup, bisectable commits, PR with structured body, verification gate, deploy. 12-point checklist.

**Quality**

- `/soloship:review` — Detects whether the target is a plan or code. Plans route to `plan-eng-review`, `plan-ceo-review`, or `plan-design-review`. Code gets a 3-pass parallel review: structural (SQL safety, auth, types, tests), adversarial (load, bad input, state transitions), and design-lite (a11y, responsive, AI slop — only if frontend changed). Severity classification with file:line references.
- `/soloship:qa` — Routes to gstack `qa` (test and fix) or `qa-only` (report only). Uses accessibility checklist as baseline.
- `/soloship:security` — Routes to gstack `cso` for infrastructure-first security scanning: OWASP Top 10, STRIDE threat modeling, secrets archaeology, dependency supply chain, npm audit.
- `/soloship:design-review` — Two-pass visual audit. Pass 1 routes to gstack `design-review` for spacing, hierarchy, and consistency. Pass 2 is Soloship's own AI slop detection — flags generic gradients, default shadows, "Welcome to" copy, 3-column feature grids, and other patterns that mark AI-generated design. Each fix committed atomically with before/after screenshots.

## Quick start

See the [Install](#install) section above for the two commands to install the plugin. Once installed, the daily flow inside any project is:

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

### Prefer an npm installer?

If you'd rather set up the project scaffolding outside Claude Code (for example, in a scripted environment or CI), the npm CLI does the same thing bootstrap does:

```bash
npx soloship init
```

Most people should use `/soloship:bootstrap` — it's the supported path and it can tailor setup to audit findings.

## Design decisions

1. **Audit before bootstrap on existing projects.** Don't impose governance on a codebase you haven't understood yet.
2. **Design-first principle.** `/soloship:brainstorm` nudges you toward visual design before `/soloship:plan`. Design catches problems text can't.
3. **Hooks for enforcement, skills for intelligence.** Hooks are mechanical and fire automatically. Skills are guided and require judgment. Rules sit underneath both — they're always on, even when the skill forgets.
4. **npm installer + Claude Code plugin.** Installer handles one-time infrastructure. Skills handle daily workflow. Different jobs, different tools.
5. **Routers, not rewrites.** Where [Superpowers](https://github.com/anthropics/superpowers), [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin), or [gstack](https://github.com/garrytan/gstack) already do the job well, Soloship routes to them and adds enforcement gates, routing logic, and solo-operator defaults on top. When upstream skills improve, Soloship benefits automatically.

## Status

| Phase | Status | What it delivered |
|-------|--------|-------------------|
| 1-2 | Done | Cleanup + `npx soloship init` with stack detection |
| 3-4 | Done | `/audit` + `/bootstrap` skills |
| 5-6 | Done | 14 more skills (16 total) + 9 hooks + 4 rules |
| 7 | Not started | Safety floor hardening, surface simplification, CLAUDE.md governance |
| 8 | Not started | Graduation system, methodology documentation |

Phases 1-6 are shipped and usable today. Phases 7-8 were restructured after a [3-round adversarial review](docs/research/2026-04-08-adversarial-review-synthesis.md) that identified rationalization traps in the original design. Phase 7 adds mechanical safety enforcement (Semgrep scanning, automated rollback, phone-a-friend triggers) and consolidates the 16 skills into 3-4 meta-workflows. Phase 8 adds a graduation system with calibrated thresholds that tell you when your project has outgrown solo mode.

## Prior art & influences

Soloship builds on top of four Claude Code skill ecosystems rather than replacing them:

[Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin) — `/learn` uses CE's `workflows:compound` to create solution documents with structured frontmatter. The multi-agent pattern in CE informs how `/audit` and `/review` dispatch parallel investigation agents.

[Superpowers](https://github.com/anthropics/superpowers) — `/brainstorm` routes to `superpowers:brainstorming` for technical exploration. `/plan` routes to `superpowers:writing-plans`. `/implement` routes to `superpowers:subagent-driven-development` or `superpowers:dispatching-parallel-agents`. `/debug` routes to `superpowers:systematic-debugging`.

[gstack](https://github.com/garrytan/gstack) — `/qa` routes to gstack's QA skill. `/security` routes to `cso`. `/design-review` routes to gstack's design-review checklist. `/brainstorm` routes to `office-hours` for product questions. `/plan` routes to `plan-eng-review` for architectural work. `/review` routes to `plan-eng-review`, `plan-ceo-review`, and `plan-design-review` for plan reviews.

[intent-layer](https://github.com/crafter-station/skills/tree/main/context-engineering/intent-layer) (crafter-station/skills, built on [The Intent Layer](https://www.intent-systems.com/learn/intent-layer) by Tyler Brandt) — `/learn` Steps 4-5 adapt the concept of distributed per-directory `AGENTS.md` files for codebase navigation. Soloship's version is continuous (updates on every `/learn` pass, not one-shot), threshold-gated (3+ source files before creating), append-only with dated attribution, and scoped to solution-doc evidence rather than speculative. `/bootstrap` and `/cleanup` also maintain the AGENTS.md network.

[Impeccable](https://github.com/pbakaus/impeccable) — `/design-review` adds an AI slop detection pass inspired by Impeccable's design quality philosophy, checking for generic AI-generated visual, content, and layout patterns.

[Serena](https://github.com/oraios/serena) — symbol-level LSP code navigation. Optional. Worth adding once a codebase outgrows file-level tools; see Serena's README for install instructions.

The broader design traces back to a research pass across: Ousterhout on strategic vs tactical programming (you are the architect, the agent implements), Hickey on simple vs easy, Metz on dependency awareness and sizing rules, Meadows on leverage points in systems, the BCG "AI Brain Fry" finding that productivity drops past three tools, Kathy Sierra on the collapse zone (only automated process survives when things break), and the Codified Context paper that validated the CLAUDE.md + AGENTS.md + docs/ three-tier pattern.

## Repo layout

```
bin/soloship.js        # CLI entry point
src/                   # TypeScript source for the installer
  cli.ts               # Commander CLI definition
  init.ts              # Main init orchestration
  detect.ts            # Stack detection
  scaffold.ts          # Folder + doc creation
  hooks.ts             # Claude Code hook configuration
  rules.ts             # Workflow rule installation
  ci.ts                # GitHub Actions + architecture fitness
  templates.ts         # CLAUDE.md / AGENTS.md / CHANGELOG / SOLUTION_GUIDE generators
skills/                # Claude Code skills, symlinked to ~/.claude/skills/soloship-*
  audit/ bootstrap/ brainstorm/ spec/ plan/ implement/ review/
  cleanup/ debug/ learn/ shipfast/ shipthorough/ qa/ security/
  design-review/ onboard/ references/
docs/
  design/              # System design and command specs
site/                  # Static methodology + workflow guides
CLAUDE.md              # Internal working notes for the project
```

## License

MIT.

## A note to anyone reading this

Soloship is opinionated and unfinished. It's the working toolkit of one person who builds software through AI agents and is trying to do it responsibly. If you find it useful, great. If you think a decision is wrong, open an issue — the adversarial-review phase of this project already taught me that the things I'm most confident about are the things most likely to need a second pair of eyes.
