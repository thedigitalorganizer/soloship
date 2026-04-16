# Soloship

> Ship solo, safely.

Soloship is guardrails for non-coders building software through AI agents. It gives you three things a traditional engineering team would: a **safety floor** that fires automatically (hooks, CI, rules — no judgment calls required), a **small set of workflow skills** that guide you through the steps a professional would take (plan, implement, review, ship, debug), and a **graduation signal** that tells you when your project has outgrown solo mode and it's time to hire help.

**Quick reference:** [aifoundationlevels.com/soloship-cheatsheet](https://aifoundationlevels.com/soloship-cheatsheet)

## How we got here

Soloship didn't start as a project. It started as a frustration.

We had 40+ solution documents in `docs/solutions/` — real fixes to real problems we'd hit before. The kind of knowledge that should prevent you from making the same mistake twice. But the agents kept making the same mistakes. We finally stopped and asked why.

The answer: none of the tools in our stack were reading the solutions at the point of execution. [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin)'s planning workflow dispatches a `learnings-researcher` agent that searches `docs/solutions/` — but it runs once, during the research phase, and its results get compressed into a few bullet points in the plan doc. The execution workflow never touches the solutions directory. It reads the plan, follows the plan, and trusts the plan to carry everything forward. With 40+ solution docs, most get scored out during the research pass. What survives is a summary of a summary. And once execution starts, there's no retrieval — even when the agent is hitting the exact error a solution doc describes.

So we tried **rules** — a `solution-search` rule that told the agent to check solutions before planning, debugging, or reviewing. It helped, when the agent followed it. But rules are suggestions. The agent would rationalize past them: "this is a simple change, no need to search." We'd ask if the rules were followed, and the honest answer was usually no.

So we tried **hooks** — mechanical triggers that fire regardless of what the agent is paying attention to. Hooks can't be rationalized away. That worked better. But wiring up hooks, rules, solution docs, `AGENTS.md` files, and CI checks for each new project was its own overhead.

And the workflow skills we were routing through weren't quite right either. [gstack](https://github.com/garrytan/gstack) has a strong skill set — QA, design review, security, shipping — but its skills are verbose and try to cover too much surface area. The agent would get lost in instruction volume, or the skill would prescribe steps that didn't apply to a solo operator's workflow. So we started pulling the good parts out and writing our own versions: leaner, opinionated for the solo use case, with enforcement gates and solution-search wired in from the start.

That became Soloship.

## What you get

### The installer

```bash
npx soloship init
```

Detects your language, framework, and package manager, asks a few questions, and installs:

- **Folder scaffolding** — `docs/plans/`, `docs/solutions/`, `docs/audit/`, `AGENTS.md` stubs
- **9 Claude Code hooks** — dangerous command blocking, auto-lint, CHANGELOG check, dependency graph, plan validation, workflow navigator, handoff reminder, context injection, architecture fitness
- **4 workflow rules** — solution search, plan materialization, plan rationale, plan lifecycle
- **GitHub Actions CI** with architecture fitness functions
- **Generated docs** — CLAUDE.md, AGENTS.md, CHANGELOG, SOLUTION_GUIDE, sized to your stack

Run it once per project.

### The skills

16 Claude Code skills invoked as `/soloship-*` slash commands, organized by when you use them:

**Setup & orientation**
- `/soloship-audit` — deep 2-phase codebase investigation (understand before you govern)
- `/soloship-bootstrap` — configure governance from audit findings or interactive questions
- `/soloship-onboard` — codebase orientation briefing for fresh sessions

**Daily work**
- `/soloship-brainstorm` — product or technical exploration, with a design-first nudge
- `/soloship-spec` — formal specification with acceptance criteria
- `/soloship-plan` — solution search + plan writing with enforcement gates
- `/soloship-implement` — route to subagent-driven or parallel execution
- `/soloship-debug` — systematic debugging with the root-cause iron law
- `/soloship-learn` — capture solutions, update learnings log, propagate to AGENTS.md
- `/soloship-cleanup` — knowledge system maintenance (dedup solutions, prune stale refs, enforce plan lifecycle, rebuild indexes)

**Shipping**
- `/soloship-shipfast` — emergency deploy (lint, test, build, commit, push, deploy)
- `/soloship-shipthorough` — full pipeline with review, coverage audit, registry update, PR

**Quality**
- `/soloship-review` — plan reviews (engineering, CEO, design) or code reviews (3-pass)
- `/soloship-qa` — headless browser QA testing
- `/soloship-security` — OWASP / STRIDE security audit
- `/soloship-design-review` — visual audit with AI-slop detection

The skills route to underlying workflows in [Superpowers](https://github.com/anthropics/superpowers), [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin), [Impeccable](https://github.com/pbakaus/impeccable), and [gstack](https://github.com/garrytan/gstack) where those already exist. Soloship adds the routing, the enforcement gates, and the solo-operator defaults.

## Quick start

**New project:**

```bash
mkdir my-new-thing && cd my-new-thing
npx soloship init
# then: /soloship-brainstorm → /soloship-plan → /soloship-implement
```

**Existing project:**

```bash
cd existing-project
/soloship-audit        # understand it first
/soloship-bootstrap    # install governance informed by the audit
# then: /soloship-plan → /soloship-implement → /soloship-shipthorough
```

## Design decisions

1. **Audit before bootstrap on existing projects.** Don't impose governance on a codebase you haven't understood yet.
2. **Design-first principle.** `/soloship-brainstorm` nudges you toward visual design before `/soloship-plan`. Design catches problems text can't.
3. **Hooks for enforcement, skills for intelligence.** Hooks are mechanical and fire automatically. Skills are guided and require judgment. Rules sit underneath both — they're always on, even when the skill forgets.
4. **npm installer + Claude Code plugin.** Installer handles one-time infrastructure. Skills handle daily workflow. Different jobs, different tools.

## Status

The installer works. The 16 skills are in place. The hooks and rules are wired up. You can use it today on a real project.

What's next:

- **Safety floor hardening** — mechanical triggers, security scanning, rollback, artifact contracts
- **Surface simplification** — consolidating the 16 skills into 3-4 meta-workflows with observable-fact checkpoints
- **CLAUDE.md governance** — a budget for CLAUDE.md size, priority tiers, an audit hook that fires every Nth commit
- **Graduation system** — calibrated thresholds that tell you when to hire help

## Prior art & influences

Soloship's `/soloship-learn` skill adapts the [intent-layer](https://github.com/crafter-station/skills/tree/main/context-engineering/intent-layer) concept from [crafter-station/skills](https://github.com/crafter-station/skills), built on [The Intent Layer](https://www.intent-systems.com/learn/intent-layer) by Tyler Brandt — the idea that distributed per-directory `AGENTS.md` files let agents navigate a codebase the way a senior engineer would. Soloship's version is continuous (updates on every `/learn` pass, not one-shot), threshold-gated (3+ source files before creating), append-only with dated attribution, and scoped to solution-doc evidence rather than speculative.

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
