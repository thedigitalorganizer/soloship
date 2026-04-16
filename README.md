# Soloship

> Ship solo, safely. Guardrails for non-coders building software through AI agents.

Soloship is a methodology and toolkit for people who direct AI coding agents (like Claude Code) to build real software — without a traditional engineering team behind them. It installs mechanical safety rails and a set of workflow skills that keep you out of the kinds of trouble a senior engineer would usually catch for you, and tells you when you've outgrown solo mode.

**Value prop:** Keeps you safe while solo, tells you when you're not, makes the handoff smooth when you graduate to a real team.

**Quick reference:** [aifoundationlevels.com/soloship-cheatsheet](https://aifoundationlevels.com/soloship-cheatsheet) — bookmarkable one-pager of the skills and workflows.

## Why this exists

AI coding agents made it possible for one person with no engineering background to build software. That's the miracle. The problem is that the things a senior engineer quietly prevents — hidden coupling, missing tests, silent regressions, un-rollback-able deploys, security sloppiness, design drift — none of those go away just because the agent is writing the code. They just happen faster, and without anyone noticing.

Soloship exists to close that gap for solo operators. Not by pretending you're an engineer, and not by trying to replace one — but by giving you:

1. **A safety floor** — mechanical enforcement (hooks, CI, rules) that fires automatically regardless of what you or the agent are paying attention to.
2. **A small set of workflow skills** — audit, plan, implement, review, ship, debug, retro — each one a guided path through the steps a professional would take.
3. **A graduation signal** — a system that watches your project and tells you when it's gotten complex enough that you need a real engineer, not just another skill.

### How we got here

Soloship didn't start as a project. It started as a frustration.

We had 40+ solution documents in `docs/solutions/` — real fixes to real problems we'd hit before. The kind of knowledge that should prevent you from making the same mistake twice. But the agents kept making the same mistakes. We finally stopped and asked why.

The answer: none of the tools in our stack were actually reading the solutions at the point of execution. [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin)'s planning workflow (`/workflows:plan`) does dispatch a `learnings-researcher` agent that searches `docs/solutions/` — but it runs once, during the research phase, and its results get compressed into a few bullet points in the plan doc. The execution workflow (`/workflows:work`) never touches the solutions directory. It reads the plan, follows the plan, and trusts the plan to carry everything forward. With 40+ solution docs, most get scored out during the research pass. What survives is a summary of a summary. And once execution starts, there's no retrieval — even when the agent is hitting the exact error a solution doc describes.

So we tried rules. We added a `solution-search` rule that told the agent to check `docs/solutions/` before planning, debugging, or reviewing. It helped — when the agent followed it. But rules are suggestions. The agent would rationalize past them: "this is a simple change, no need to search," "I already know what to do here." We'd reinforce by asking the agent if the rules were followed, and the honest answer was usually no.

So we tried hooks — mechanical triggers that fire regardless of what the agent is paying attention to. Hooks can't be rationalized away. That worked better. But wiring up hooks, rules, solution docs, AGENTS.md files, and CI checks for each new project was its own overhead. And the workflow skills we were routing through weren't quite right either.

[gstack](https://github.com/garrytan/gstack) has a strong skill set — QA, design review, security, shipping — but its skills are verbose and try to cover too much surface area. In a lot of cases the agent would get lost in instruction volume, or the skill would prescribe steps that didn't apply to a solo operator's workflow. So we started pulling the good parts out and writing our own versions: leaner, opinionated for the solo use case, with the enforcement gates and solution-search hooks wired in from the start. That became Soloship.

It's a companion, not a replacement. It sits alongside tools like [Superpowers](https://github.com/anthropics/superpowers), [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin), [Impeccable](https://github.com/pbakaus/impeccable), and cherry-picked [gstack](https://github.com/garrytan/gstack). It doesn't duplicate what those do — it routes to them, and fills in the guardrails they assume you already have.

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

## Prior art

The AGENTS.md propagation logic inside `/soloship-learn` is adapted from [crafter-station/skills](https://github.com/crafter-station/skills)' [intent-layer](https://github.com/crafter-station/skills/tree/main/context-engineering/intent-layer) skill, which is in turn built on [The Intent Layer](https://www.intent-systems.com/learn/intent-layer) by Tyler Brandt. The core idea — distributed per-directory `AGENTS.md` files that let agents navigate the codebase the way a senior engineer would — comes from there.

Soloship's adjustments:

1. **Continuous, not one-shot.** crafter's intent-layer is a setup skill you run once. Soloship folds the AGENTS.md creation and update pass into `/soloship-learn`, which runs every time you capture knowledge from non-obvious work. The intent layer grows with the project's learning instead of being a bootstrap artifact.
2. **Threshold-gated creation.** Soloship only materializes a new `AGENTS.md` when the directory has 3+ source files and no existing file. Small directories and config-only dirs don't get governance they don't need.
3. **Append-only with dated attribution.** When an `AGENTS.md` already exists, `/learn` appends entries in a fixed shape (`### [Pitfall|Contract|Invariant]: title` with a dated `_Added by soloship-learn_` line). Never overwrites.
4. **Scoped to solution-doc evidence.** Each propagation pass uses the `files` frontmatter of the solution doc just written as its scope. No speculative updates — only directories proven relevant by the current learning.
5. **Anti-stub rule.** If real scope can't be inferred from the files in a directory, `/learn` skips it. A missing `AGENTS.md` is better than a wrong one that misleads future agents.
6. **Tied to the architecture registry.** `/learn` also runs a drift check against `docs/architecture/REGISTRY.md` in the same pass, connecting per-directory intent with a project-wide component map.

## License

MIT.

## A note to anyone reading this

Soloship is opinionated and unfinished. It's the working toolkit of one person who builds software through AI agents and is trying to do it responsibly. If you find it useful, great. If you think a decision is wrong, open an issue — the adversarial-review phase of this project already taught me that the things I'm most confident about are the things most likely to need a second pair of eyes.
