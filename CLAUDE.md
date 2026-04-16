# CLAUDE.md — Soloship

**Soloship** — Ship solo, safely. Guardrails for non-coders building software through AI agents (Claude Code).

**Two deliverables:**
1. `npx soloship init` — npm CLI that installs mechanical enforcement + documentation infrastructure
2. Soloship Claude Code plugin — 16 skills for audit, bootstrap, and daily workflow

## Status

Phases 1-6 of 8 complete. **Phases 7-8 restructured** after adversarial review (2026-04-08).

See `docs/design/2026-04-06-foundation-system-design.md` for original design.
See `docs/plans/2026-04-08-foundation-phase-7-8-restructure.md` for restructured plan.
See `docs/research/2026-04-08-adversarial-review-synthesis.md` for the reasoning behind the restructure.

| Phase | Status | Deliverables |
|-------|--------|-------------|
| 1. Retire & clean | Done | GSD removed, gstack pruned, phantom refs fixed |
| 2. npm installer | Done | `npx soloship init` working |
| 3. Audit tool | Done | `/soloship-audit` skill |
| 4. Bootstrap | Done | `/soloship-bootstrap` skill |
| 5. Workflow commands | Done | 14 additional skills (16 total) |
| 6. Hooks | Done | All 9 hooks implemented |
| 7. Safety + Simplification | Not started | WS1: safety floor, WS2: surface simplification, WS3: CLAUDE.md governance |
| 8. Graduation + Docs | Not started | WS4: graduation system, methodology page for aifoundationlevels.com |

## Project Structure

```
├── package.json           # npm package config
├── tsconfig.json          # TypeScript configuration
├── bin/
│   └── soloship.js        # CLI entry point (npx shim)
├── src/
│   ├── cli.ts             # Commander CLI definition
│   ├── init.ts            # Main init orchestration
│   ├── detect.ts          # Stack detection (language, framework, package manager)
│   ├── scaffold.ts        # Folder structure + doc creation
│   ├── hooks.ts           # Claude Code hook configuration (9 hooks)
│   ├── rules.ts           # Workflow rule installation (4 rules)
│   ├── ci.ts              # GitHub Actions CI + architecture fitness functions
│   └── templates.ts       # CLAUDE.md, AGENTS.md, CHANGELOG, SOLUTION_GUIDE generators
├── dist/                  # Compiled output (gitignored)
├── skills/                # Claude Code skills (symlinked to ~/.claude/skills/)
│   ├── audit/SKILL.md         # Deep 2-phase codebase investigation
│   ├── bootstrap/SKILL.md     # Configure governance from audit or questions
│   ├── brainstorm/SKILL.md    # Product or technical exploration → design-first nudge
│   ├── plan/SKILL.md          # Solution search + enforcement gate
│   ├── implement/SKILL.md     # Route to subagent-driven or parallel
│   ├── review/SKILL.md        # Plan reviews (eng/CEO/design) or code reviews (3-pass)
│   ├── debug/SKILL.md         # Systematic debugging with root cause iron law
│   ├── learn/SKILL.md         # Solution doc + learnings.jsonl + registry audit
│   ├── shipfast/SKILL.md      # Emergency deploy: lint → test → build → commit → push → deploy
│   ├── shipthorough/SKILL.md  # Full pipeline: review, coverage, registry, PR, deploy
│   ├── qa/SKILL.md            # Headless browser testing
│   ├── security/SKILL.md      # OWASP/STRIDE security audit
│   ├── design-review/SKILL.md # Visual audit + AI Slop Detection
│   ├── retro/SKILL.md         # Weekly retrospective
│   ├── spec/SKILL.md          # Formal specification with acceptance criteria
│   └── onboard/SKILL.md       # Codebase orientation briefing
└── docs/
    ├── design/
    │   ├── 2026-04-06-foundation-system-design.md  # Full system design (source of truth)
    │   └── original-command-specs.md               # Detailed routing logic from original plan
    └── research/
        ├── systematic-programming-research.md      # 35K-word deep research (6 questions)
        ├── 2026-04-02-skill-audit-findings.md      # 133-skill inventory + analysis
        ├── 2026-04-03-skill-audit-review-synthesis.md  # 4-agent review panel findings
        ├── 2026-04-03-workflow-engineering-research-brief.md  # Research brief + vision
        ├── compass_artifact_wf-*.md                # Compass deep research: complexity analysis
        ├── foundation-deep-research-bundle.md      # Full system bundle for research agents
        └── 2026-04-08-adversarial-review-synthesis.md  # 3-round adversarial review findings
```

## Quick Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript → dist/
npm run dev          # Watch mode compilation

# Test locally
node dist/cli.js init --skip-prompts    # Run init in current directory
```

## Key Design Decisions

1. **Companion, not replacement** — sits alongside Superpowers, CE, Impeccable, cherry-picked gstack
2. **npm installer + Claude Code plugin** — installer handles one-time setup, plugin handles daily workflow
3. **Audit before bootstrap** (existing projects) — understand before governing
4. **Design-first principle** — /brainstorm nudges visual design before /plan
5. **Hooks for enforcement, skills for intelligence** — different jobs, different tools
6. **Rules stay mandatory** — commands add enforcement on top (belt + suspenders)

## Skills Are Symlinked

Skills in `skills/` are symlinked to `~/.claude/skills/soloship-*`. Edit them here, they're live immediately. Current symlinks:

```bash
# To verify:
ls -la ~/.claude/skills/soloship-*

# To re-symlink after moving the project:
for skill in skills/*/; do
  name=$(basename "$skill")
  ln -sf "$(pwd)/skills/$name" ~/.claude/skills/soloship-$name
done
```

## Research Foundation

All design decisions trace back to the research in `docs/research/systematic-programming-research.md`. Key sources:
- **Ousterhout** — strategic vs tactical programming (you are the architect, AI implements)
- **Hickey** — simple vs easy, think before you code
- **Metz** — dependency awareness, 4 rules (100 lines/class, 5 lines/method, 4 params)
- **Meadows** — leverage points, systems thinking
- **BCG "AI Brain Fry"** — productivity drops beyond 3 tools
- **Kathy Sierra** — collapse zone (only automated process survives)
- **Codified Context paper** — CLAUDE.md + AGENTS.md + docs/ three-tier validated

### Adversarial Review (2026-04-08)

**Value prop:** "Keeps you safe while solo, tells you when you're not, makes the handoff smooth."

**Rationalization traps** (watch for these in your own reasoning):
1. **Layer conflation** — solving problem A, claiming victory over adjacent problem B
2. **"This time is different"** — assuming current model transcends known limits
3. **UX-as-safety** — smoother experience ≠ safer experience; friction can be protective
4. Common thread: watch for "therefore" bridging two different problem domains

**Phase 7-8 action list:** safety floor (mechanical triggers, security scanning, rollback, artifact contracts) → surface simplification (16 skills → 3-4 workflows, observable-fact checkpoints — never evaluative self-assessment) → CLAUDE.md governance (40-50 line budget, priority tiers, audit hook triggered every Nth commit) → graduation system (v0 thresholds, calibrated with real-world data, that tell users when to hire help)

**Accepted risk:** The default path through meta-workflows has no independent technical evaluation. Checkpoints verify intent and present observable facts. Technical quality falls to the mechanical safety floor. The gap between "user wanted this" and "this was built well" is partially automated, not human-checked. See Accepted Risks section in the plan.

Full reasoning: `docs/research/2026-04-08-adversarial-review-synthesis.md`
Full plan: `docs/plans/2026-04-08-foundation-phase-7-8-restructure.md`

## Dependencies on Other Plugins

Soloship skills route to these external skills:
- `superpowers:brainstorming`, `superpowers:writing-plans`, `superpowers:systematic-debugging`, `superpowers:subagent-driven-development`, `superpowers:dispatching-parallel-agents`
- `compound-engineering:workflows:compound`
- `office-hours`, `plan-eng-review`, `plan-ceo-review`, `plan-design-review` (gstack, kept as symlinks)
- `qa`, `cso`, `design-review`, `retro` (gstack, kept as symlinks)

If any of these are renamed or removed by their maintainers, the Soloship routers that reference them will need updating.
