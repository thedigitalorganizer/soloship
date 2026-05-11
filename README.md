# Soloship

> Ship solo, safely.

Soloship is guardrails for non-coders building software through AI agents. It's a Claude Code plugin that gives you three things a traditional engineering team would: **mechanical enforcement** that fires automatically (9 hooks, 4 rules, CI checks — no judgment calls required), **14 Soloship-native workflow skills + 32 vendored skills from five best-in-class plugins** that guide you through the steps a professional would take (each with enforcement gates and anti-rationalization tables so the agent can't cut corners), and **a one-command setup** that detects your stack and wires everything into the project.

**Quick reference:** [aifoundationlevels.com/soloship-cheatsheet](https://aifoundationlevels.com/soloship-cheatsheet)

## Install

Soloship has two parts that work together:

| Part | What it gives you | How it's installed |
|------|-------------------|--------------------|
| **Plugin** | The `/soloship:*` slash commands (audit, bootstrap, brainstorm, plan, etc.) | Claude Code plugin marketplace — once per machine |
| **Project scaffolding** | Hooks, rules, CI, `CLAUDE.md`, version stamp for update notifications | `npx soloship init` (or `/soloship:bootstrap`, which calls it for you) — once per project |

You need both for the full experience. The plugin alone gets you slash commands but no project guardrails. The npm CLI alone gets you guardrails but no slash commands.

If you don't have [Claude Code](https://claude.com/claude-code) installed yet, install it first.

### Step 1 — Install the plugin (once per machine)

Inside any Claude Code session, run these two commands **one at a time** — run the first, wait for it to finish, then run the second:

**Add the marketplace:**

```
/plugin marketplace add thedigitalorganizer/soloship
```

**Install the plugin:**

```
/plugin install soloship@soloship
```

The plugin installs globally. All Soloship commands are now available as `/soloship:*` slash commands in every project you open.

### Step 2 — Set up a project (once per project)

See "Using Soloship in a project" below. The bootstrap skill calls `npx soloship init` under the hood, so you don't need to run anything from a terminal — `/soloship:bootstrap` is enough.

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
| `/autoplan` | gstack `autoplan` | Chains CEO + design + eng + DX reviews with auto-decisions |
| `/checkpoint` | gstack `checkpoint` | Session state snapshots for `/clear` recovery; pairs with `/onboard` |
| `/health` | gstack `health` | Composite 0-10 quality score with trend tracking; pre-ship gate |

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

**14 Soloship-native workflow skills** invoked as `/soloship:*` slash commands. Each one handles orchestration, enforcement, and artifact contracts; the heavy lifting is often delegated to a vendored skill (see the next section).

**Setup & orientation**

- `/soloship:audit` — Deep 2-phase codebase investigation. Phase 1 launches 4 parallel agents to map architecture, conventions, decisions, and infrastructure. Phase 2 launches 6 more to assess quality, entanglement, security, dependencies, gaps, and leverage points. Human checkpoint between phases prevents building assessment on wrong assumptions. Produces `docs/audit/AUDIT-YYYY-MM-DD.md` + `audit-findings.json`.
- `/soloship:bootstrap` — Configures governance from audit findings or interactive questions. Creates CLAUDE.md, AGENTS.md files (3+ source file threshold), installs 4 core rules, and wires up hooks. Never overwrites existing files. Anti-rationalization table blocks "I'll set up governance later."
- `/soloship:onboard` — Reads CLAUDE.md, AGENTS.md, audit reports, and recent git history to produce a 7-section orientation briefing. Flags stale audit reports. No external routing — fully self-contained.

**Daily work**

- `/soloship:brainstorm` — Detects whether the question is demand-validation (should this exist?) or feature-shaping (what should this do?) and routes accordingly: `gs-office-hours` for demand, `ce-brainstorm` for feature. Ends with a mandatory design-first nudge — sketch before you plan.
- `/soloship:spec` — Writes formal specifications with numbered acceptance criteria, data models, API contracts, user flows (including error states), and explicit out-of-scope boundaries. 8-point verification checklist. Fully self-contained.
- `/soloship:plan` — Searches `docs/solutions/` for prior art, reads architecture context, then invokes `ce-plan` to produce the plan. 7-point enforcement gate validates: Why lines, Key Decisions, Execution Strategy, Handoff section, no unaddressed pitfalls. Review is separate — handled by `/soloship:review`.
- `/soloship:implement` — Finds the most recent plan in `docs/plans/`, invokes `ce-work` for execution with branching and QC. Freshness check warns on stale plans.
- `/soloship:debug` — Iron law: no fixes without root cause investigation. Searches solutions for prior art first, then invokes `sp-systematic-debugging` for 4-phase discipline (Investigate → Analyze → Hypothesize → Implement). Nudges `/learn` for non-obvious fixes.
- `/soloship:learn` — Captures knowledge from non-obvious work. Invokes `ce-compound` for solution doc creation. Adds Soloship protocols: JSONL logging for cross-session search, architecture registry drift checking, and distributed AGENTS.md propagation (pitfalls into existing AGENTS.md files, new ones for directories above the 3-file governance threshold). Anti-rationalization table blocks "this fix was straightforward, not worth documenting."
- `/soloship:cleanup` — Knowledge system maintenance. Launches 5 parallel audit agents (solution health, overlap detection, plan lifecycle, AGENTS.md staleness, index sync), presents findings interactively, then executes approved changes in a single atomic commit. Merge candidates require 2-of-3 signal threshold.

**Shipping**

- `/soloship:shipfast` — Emergency deploy pipeline. Lint (with auto-fix tolerance), test (pre-existing failures allowed), build (must pass), commit, push, deploy. Auto-detects platform. Minimum viable safety, maximum speed.
- `/soloship:shipthorough` — Full due diligence: preflight checks, base branch merge, lint, test, inline quality gate (TypeScript + linter + dead code + shellcheck), coverage audit, 3-pass code review (via `/review`), registry update, CHANGELOG enforcement, plan lifecycle cleanup, bisectable commits, PR with structured body, verification gate, deploy.

**Quality**

- `/soloship:review` — Detects whether the target is a plan or code. **Plans** route to `gs-plan-eng-review`, `gs-plan-ceo-review`, `gs-plan-design-review` individually, or `gs-autoplan` for all four (adds DX review) in one auto-decided pass. **Code** routes to `ce-review` for PR-scale multi-agent analysis, or runs three inline passes (structural, adversarial, design slop lens) for quick local checks.
- `/soloship:design-review` — Two-pass visual audit. Pass 1 invokes `gs-design-review` for spacing, hierarchy, and consistency. Pass 2 is Soloship's own AI slop detection (inspired by Impeccable) — flags generic gradients, default shadows, "Welcome to" copy, 3-column feature grids, and other patterns that mark AI-generated design. Each fix committed atomically with before/after screenshots.

**Note:** Skills that were previously thin wrappers over vendored gstack skills (`/soloship:qa`, `/soloship:security`, `/soloship:checkpoint`, `/soloship:autoplan`, `/soloship:health`) have been removed. Use the vendored originals directly: `/gs-qa`, `/gs-cso`, `/gs-context-save` / `/gs-context-restore`, `/gs-autoplan`. Health has no replacement — its core checks were inlined into `/soloship:shipthorough`'s quality gate.

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

### Running the npm CLI directly

`/soloship:bootstrap` calls `npx soloship init` under the hood, so you don't usually need to think about the npm CLI. But it's there if you want to script setup, run it in CI, or skip the slash command entirely:

```bash
npx soloship init        # initial setup
npx soloship upgrade     # refresh hooks, rules, CI, and version stamp to the latest
npx soloship doctor      # check Claude Code environment for missing companions
npx soloship rollback    # restore the last safety snapshot
```

After install, every Claude Code session checks once a day whether a new Soloship version has been published. When one is, you'll see a single line at the top of the session:

```
Soloship update available: 0.1.0 → 0.2.0. Run: npx soloship upgrade
```

Run `npx soloship upgrade` whenever you see that. It refreshes hooks, rules, and CI, then re-stamps the version. Your project docs (`CLAUDE.md`, `AGENTS.md`, `CHANGELOG.md`) are preserved.

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
| 5-6 | Done | 17 more skills (19 total) + 9 hooks + 4 rules |
| 7 | Not started | Safety floor hardening, surface simplification, CLAUDE.md governance |
| 8 | Not started | Graduation system, methodology documentation |

Phases 1-6 are shipped and usable today. Phases 7-8 were restructured after a 3-round adversarial review that identified rationalization traps in the original design. Phase 7 adds mechanical safety enforcement (Semgrep scanning, automated rollback, phone-a-friend triggers) and consolidates the native skills into 3-4 meta-workflows. Phase 8 adds a graduation system with calibrated thresholds that tell you when your project has outgrown solo mode.

## Built on the shoulders of

Soloship curates and vendors skills from five outstanding Claude Code plugins. One plugin install for the user; full credit and install links for the authors. Full attribution and version pins live in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

[**Compound Engineering**](https://github.com/EveryInc/compound-engineering-plugin) — Kieran Klaassen (Every). The brainstorm → plan → work → compound loop is the spine of how Soloship thinks about engineering. Also: `/review` inherits CE's multi-agent review pattern.

[**Superpowers**](https://github.com/obra/superpowers) — Jesse Vincent. The discipline skills: `systematic-debugging`'s "no fixes without root cause," `verification-before-completion`'s "evidence before claims," `test-driven-development`, `writing-plans`, `brainstorming`.

[**Impeccable**](https://impeccable.style) — Paul Bakaus (extending Anthropic's original `frontend-design`). Design vocabulary and steering commands that let non-coders ship work that doesn't look AI-generated. Soloship vendors `frontend-design` and five `/i-*` commands; 12 more are in the full plugin.

[**ui-ux-pro-max**](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) — nextlevelbuilder. The design reference library: styles, palettes, font pairings, UX guidelines, chart patterns, across every stack the agent might target.

[**gstack**](https://github.com/garrytan/gstack) — Garry Tan (YC). The solo builder toolkit. Soloship vendors 11 of the most non-coder-friendly skills — `autoplan` (chains CEO + design + eng + DX reviews), `checkpoint`, `browse`, `qa`, `design-review`, the plan-review trio, `office-hours`, `cso`. Full gstack has ~25 more.

If any of these are useful to you, please install the full upstream plugin — each `THIRD_PARTY_NOTICES.md` section has the one-line install command, and you'll get everything the author built, not just Soloship's selection.

Also influential but not vendored:

[**intent-layer**](https://github.com/crafter-station/skills/tree/main/context-engineering/intent-layer) (crafter-station/skills, built on [The Intent Layer](https://www.intent-systems.com/learn/intent-layer) by Tyler Brandt) — `/learn` Steps 4-5 adapt the concept of distributed per-directory `AGENTS.md` files for codebase navigation. Soloship's version is continuous (updates on every `/learn` pass, not one-shot), threshold-gated (3+ source files before creating), append-only with dated attribution, and scoped to solution-doc evidence rather than speculative. `/bootstrap` and `/cleanup` also maintain the AGENTS.md network.

[**Serena**](https://github.com/oraios/serena) — symbol-level LSP code navigation. Optional. Worth adding once a codebase outgrows file-level tools; see Serena's README for install instructions.

The broader design traces back to a research pass across: Ousterhout on strategic vs tactical programming (you are the architect, the agent implements), Hickey on simple vs easy, Metz on dependency awareness and sizing rules, Meadows on leverage points in systems, the BCG "AI Brain Fry" finding that productivity drops past three tools, Kathy Sierra on the collapse zone (only automated process survives when things break), and the Codified Context paper that validated the CLAUDE.md + AGENTS.md + docs/ three-tier pattern.

## Repo layout

```
.claude-plugin/        # Plugin manifest (plugin.json, marketplace.json)
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
skills/                # Claude Code skills shipped by the plugin
  # 14 Soloship-native workflows:
  audit/ bootstrap/ brainstorm/ cleanup/ debug/ design-review/
  implement/ learn/ onboard/ plan/ review/ shipfast/ shipthorough/ spec/

  # 32 vendored skills (full attribution in THIRD_PARTY_NOTICES.md):
  ce-*        # 8 from Compound Engineering (Kieran Klaassen, MIT)
  sp-*        # 5 from Superpowers (Jesse Vincent, MIT)
  im-*        # 6 from Impeccable (Paul Bakaus, Apache 2.0)
  uiux-*      # 1 from ui-ux-pro-max (nextlevelbuilder, MIT)
  gs-*        # 12 from gstack (Garry Tan, MIT)

  references/          # Shared checklists (a11y, code review, perf, security, testing)
  vendored/            # Per-source LICENSE / NOTICE / VERSION / README (attribution archive)
```

## License

MIT.

## A note to anyone reading this

Soloship is opinionated and unfinished. It's the working toolkit of one person who builds software through AI agents and is trying to do it responsibly. If you find it useful, great. If you think a decision is wrong, open an issue — the adversarial-review phase of this project already taught me that the things I'm most confident about are the things most likely to need a second pair of eyes.
