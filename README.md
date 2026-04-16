# Soloship

> Ship solo, safely. Guardrails for non-coders building software through AI agents.

Soloship is a methodology and toolkit for people who direct AI coding agents (like Claude Code) to build real software — without a traditional engineering team behind them. It installs mechanical safety rails and a set of workflow skills that keep you out of the kinds of trouble a senior engineer would usually catch for you, and tells you when you've outgrown solo mode.

**Value prop:** Keeps you safe while solo, tells you when you're not, makes the handoff smooth when you graduate to a real team.

## Why this exists

AI coding agents made it possible for one person with no engineering background to build software. That's the miracle. The problem is that the things a senior engineer quietly prevents — hidden coupling, missing tests, silent regressions, un-rollback-able deploys, security sloppiness, design drift — none of those go away just because the agent is writing the code. They just happen faster, and without anyone noticing.

Soloship exists to close that gap for solo operators. Not by pretending you're an engineer, and not by trying to replace one — but by giving you:

1. **A safety floor** — mechanical enforcement (hooks, CI, rules) that fires automatically regardless of what you or the agent are paying attention to.
2. **A small set of workflow skills** — audit, plan, implement, review, ship, debug, retro — each one a guided path through the steps a professional would take.
3. **A graduation signal** — a system that watches your project and tells you when it's gotten complex enough that you need a real engineer, not just another skill.

It's a companion, not a replacement. It sits alongside tools like [Superpowers](https://github.com/anthropics/superpowers), Compound Engineering, Impeccable, and cherry-picked gstack. It doesn't duplicate what those do — it routes to them, and fills in the guardrails they assume you already have.

## What's in the box

Two deliverables:

### 1. `npx soloship init` — one-time project setup

An npm CLI that installs the safety infrastructure into any project:

- **Folder scaffolding** — `docs/plans/`, `docs/solutions/`, `docs/audit/`, `AGENTS.md` stubs
- **9 Claude Code hooks** — dangerous command blocking, auto-lint, CHANGELOG check, dependency graph, plan validation, workflow navigator, handoff reminder, context injection, architecture fitness
- **4 workflow rules** — solution search, plan materialization, plan rationale, plan lifecycle
- **GitHub Actions CI template** with architecture fitness functions
- **CLAUDE.md / AGENTS.md / CHANGELOG / SOLUTION_GUIDE generators** sized to your project's stack

```bash
npx soloship init
```

It detects your language, framework, and package manager, asks a few questions, and lays down the infrastructure. Run it once per project.

### 2. Claude Code skills — daily workflow

16 skills that live in `~/.claude/skills/soloship-*` and get invoked as slash commands. Each one encodes the steps a professional would take for that activity:

| Skill | What it does |
|-------|--------------|
| `/soloship-audit` | Deep 2-phase investigation of an existing codebase — understand before you govern |
| `/soloship-bootstrap` | Configure governance from audit findings or interactive questions |
| `/soloship-brainstorm` | Product or technical exploration, with a design-first nudge before planning |
| `/soloship-spec` | Lightweight formal specification with acceptance criteria |
| `/soloship-plan` | Solution search + plan writing with enforcement gates |
| `/soloship-implement` | Route to subagent-driven or parallel execution depending on task shape |
| `/soloship-review` | Plan reviews (engineering, CEO, design) or code reviews (3-pass) |
| `/soloship-debug` | Systematic debugging with the root-cause iron law |
| `/soloship-learn` | Capture the solution, update the learnings log, audit the architecture registry |
| `/soloship-shipfast` | Emergency deploy — lint, test, build, commit, push, deploy |
| `/soloship-shipthorough` | Full pipeline with review, coverage audit, registry update, PR, verification |
| `/soloship-qa` | Headless browser QA testing |
| `/soloship-security` | OWASP / STRIDE security audit |
| `/soloship-design-review` | Visual audit with AI-slop detection |
| `/soloship-retro` | Weekly retrospective on commit history and work patterns |
| `/soloship-onboard` | Codebase orientation briefing for new contributors or fresh sessions |

The skills route to underlying workflows in Superpowers, Compound Engineering, and gstack where those already exist. The value Soloship adds is the routing, the enforcement gates, and the solo-operator-specific defaults.

## How to use it

**On a new project:**

```bash
mkdir my-new-thing && cd my-new-thing
npx soloship init
# answer a few questions about stack + risk tolerance
# start working with /soloship-brainstorm, /soloship-plan, /soloship-implement
```

**On an existing project:**

```bash
cd existing-project
# understand it first
/soloship-audit
# then install governance informed by what the audit found
/soloship-bootstrap
# daily work
/soloship-plan, /soloship-implement, /soloship-shipthorough
```

## Design decisions

A few things are explicit choices, not accidents:

1. **Companion, not replacement.** Soloship assumes you're using Superpowers / Compound Engineering / gstack. It routes to them. It does not reinvent plans, brainstorming, or shipping.
2. **npm installer + Claude Code plugin.** Installer does one-time setup. Skills do daily workflow. Different jobs, different tools.
3. **Audit before bootstrap on existing projects.** Don't impose governance on a codebase you haven't understood yet.
4. **Design-first principle.** `/soloship-brainstorm` nudges you toward visual design before `/soloship-plan`. Design catches problems text can't.
5. **Hooks for enforcement, skills for intelligence.** Hooks are mechanical and fire automatically. Skills are guided and require judgment. Both matter.
6. **Rules stay mandatory.** Commands add enforcement on top of rules — belt and suspenders, not belt or suspenders.

## Status

Early (`0.1.0`). Phases 1-6 of 8 complete: the installer works, the 16 skills are in place, the hooks and rules are wired up. Phases 7-8 are in progress:

- **Safety floor** — mechanical triggers, security scanning, rollback, artifact contracts
- **Surface simplification** — consolidating the 16 skills into 3-4 workflows with observable-fact checkpoints (never evaluative self-assessment)
- **CLAUDE.md governance** — a budget for CLAUDE.md size, priority tiers, an audit hook that fires every Nth commit
- **Graduation system** — thresholds that tell you when the project has outgrown solo mode and you need to hire help

## Research foundation

The design traces back to a research pass on systematic programming. Key sources:

- **Ousterhout** — strategic vs tactical programming. You are the architect; the agent implements.
- **Hickey** — simple vs easy, think before you code.
- **Metz** — dependency awareness, four rules (100 lines/class, 5 lines/method, 4 params).
- **Meadows** — leverage points, systems thinking.
- **BCG "AI Brain Fry"** — productivity drops past three tools.
- **Kathy Sierra** — the collapse zone: when things break, only the automated process survives.
- **Codified Context paper** — the CLAUDE.md + AGENTS.md + docs/ three-tier pattern.

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
  debug/ learn/ shipfast/ shipthorough/ qa/ security/
  design-review/ retro/ onboard/ references/
docs/
  design/              # System design and command specs
site/                  # Static methodology + workflow guides
CLAUDE.md              # Internal working notes for the project
```

## License

MIT.

## A note to anyone reading this

Soloship is opinionated and unfinished. It's the working toolkit of one person who builds software through AI agents and is trying to do it responsibly. If you find it useful, great. If you think a decision is wrong, open an issue — the adversarial-review phase of this project already taught me that the things I'm most confident about are the things most likely to need a second pair of eyes.
