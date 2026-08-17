# AGENTS.md — Soloship

**Soloship** — Ship solo, safely. Guardrails for non-coders building software through AI agents (Codex).

> **Audience note:** Shawn (the maintainer and primary user) is a non-coder. When explaining anything technical, lead with a plain-English analogy before any jargon. Introduce technical terms once with their meaning, then use them freely.
>
> Be brief — lead with the conclusion, cut preamble and recap, length should track the question's complexity. Frame problems and decisions in product or user-experience terms (what behavior changes, why it matters), not code. Never ask Shawn to review code, judge technical correctness, or decide implementation specifics like data models, database structure, or library choices — make those calls yourself and surface only choices that need his product judgment.
>
> **Conventions:** Coding rules auto-load from `.codex/rules/` — including parameterizing meaningful values (no magic literals; refactor un-parameterized values you find in the section you're editing, then list other affected sites and ask).

**Two deliverables:**
1. `npx soloship init` — npm CLI that installs mechanical enforcement + documentation infrastructure
2. Soloship Codex plugin — 51 skills for audit, bootstrap, brainstorming, planning, implementation, review, debugging, design, and shipping

## Status

Phases 1-6 of 8 complete. **Phases 7-8 restructured** after adversarial review (2026-04-08).

See `docs/design/2026-04-06-foundation-system-design.md` for original design.
See `docs/plans/2026-04-08-foundation-phase-7-8-restructure.md` for restructured plan.
See `docs/research/2026-04-08-adversarial-review-synthesis.md` for the reasoning behind the restructure.

| Phase | Status | Deliverables |
|-------|--------|-------------|
| 1. Retire & clean | Done | GSD removed, gstack pruned, phantom refs fixed |
| 2. npm installer | Done | `npx soloship init` working |
| 3. Audit tool | Done | `/soloship:audit` skill |
| 4. Bootstrap | Done | `/soloship:bootstrap` skill |
| 5. Workflow commands | Done | 17 additional skills (19 total) |
| 6. Hooks | Done | All 9 hooks implemented |
| 7. Safety + Simplification | Not started | WS1: safety floor, WS2: surface simplification, WS3: AGENTS.md governance |
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
│   ├── hooks.ts           # Claude Code hook configuration (29 hooks)
│   ├── rules.ts           # Workflow rule installation (19 rules)
│   ├── ci.ts              # GitHub Actions CI + architecture fitness functions
│   └── templates.ts       # CLAUDE.md, AGENTS.md, CHANGELOG, SOLUTION_GUIDE generators
├── dist/                  # Compiled output (gitignored)
├── skills/                # 47 skills (20 Soloship-native + 27 vendored standalones)
│   # NOTE: there is NO commands/ directory. Claude Code resolves commands and
│   # skills in ONE namespace, so a command file sharing a skill's name shadows
│   # it. Removed in v0.21.0; validate-plugin-metadata.js now blocks reintroduction.
│   # Soloship-native workflow skills (19):
│   ├── audit/SKILL.md         # Deep 2-phase codebase investigation
│   ├── bootstrap/SKILL.md     # Configure governance from audit or questions
│   ├── brainstorm/SKILL.md    # Feature exploration (CE+SP methodologies merged)
│   ├── grill-me/SKILL.md      # Pre-plan interview — adapted from Pocock, walks design tree, refuses plan until aligned
│   ├── plan/SKILL.md          # Solution search + CE plan-writing methodology + enforcement gate
│   ├── implement/SKILL.md     # CE execution methodology with branching/quality checks
│   ├── review/SKILL.md        # Plan reviews (CEO/eng/design/devex/autoplan) or code reviews (inline 3-pass or code-review)
│   ├── debug/SKILL.md         # Systematic debugging — Superpowers 4-phase methodology with Iron Law
│   ├── cleanup/SKILL.md       # Knowledge system maintenance (dedup, prune, reindex)
│   ├── learn/SKILL.md         # CE compound methodology + learnings.jsonl + registry audit
│   ├── shipfast/SKILL.md      # Emergency deploy: lint → test → build → commit → push → deploy
│   ├── shipthorough/SKILL.md  # Full pipeline: quality gate, review, coverage, registry, PR, deploy
│   ├── design-review/SKILL.md # Visual design audit (merged gstack design-review + Soloship slop detection)
│   ├── spec/SKILL.md          # Formal specification with acceptance criteria
│   ├── onboard/SKILL.md       # Codebase orientation briefing
│   ├── finish/SKILL.md        # Branch-completion discipline (vendored from Superpowers)
│   ├── cron/SKILL.md          # Automation registry console — crons, workers, launchd, webhooks
│   ├── status/SKILL.md        # Read-only dashboard: sessions, plan board, deploy state
│   ├── component-inventory/SKILL.md # Regenerates docs/architecture/COMPONENTS.md
│
│   # Vendored standalones (27) — all source prefixes dropped as of v0.5.0:
│   # — gstack: browse, cso, qa, autoplan, office-hours, context-save, context-restore,
│   #            ceo-review, eng-review, devex-review, plan-design-review
│   # — Compound Engineering: code-review, deepen-plan, document-review
│   # — Impeccable: clarify, critique, polish, simplify, frontend-design, ui-audit
│   # — Superpowers: executing-plans, test-driven-development, writing-plans,
│   #                verification-before-completion, subagent-driven-development,
│   #                using-git-worktrees
│   # — nextlevelbuilder: ui-ux-pro-max
│
│   ├── references/            # Shared checklists (a11y, code review, perf, security, testing)
│   └── vendored/              # Attribution archive (LICENSE/NOTICE/VERSION/README per source)
│       └── ce/ superpowers/ impeccable/ uiux/ gstack/ pocock/
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
2. **npm installer + Codex plugin** — installer handles one-time setup, plugin handles daily workflow
3. **Audit before bootstrap** (existing projects) — understand before governing
4. **Design-first principle** — /brainstorm nudges visual design before /plan, then /grill-me before plan-writing for non-trivial work (interview-first per Brooks/Pocock — share a design concept before any plan exists)
5. **Hooks for enforcement, skills for intelligence** — different jobs, different tools
6. **Rules stay mandatory** — commands add enforcement on top (belt + suspenders)

## Skills Are Symlinked

Skills in `skills/` are symlinked to `~/.Codex/skills/soloship-*`. Edit them here, they're live immediately. Current symlinks:

```bash
# To verify:
ls -la ~/.Codex/skills/soloship-*

# To re-symlink after moving the project (only dirs that contain SKILL.md):
for skill in skills/*/; do
  [ -f "$skill/SKILL.md" ] || continue
  name=$(basename "$skill")
  ln -sf "$(pwd)/skills/$name" ~/.Codex/skills/soloship-$name
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
- **Codified Context paper** — AGENTS.md + AGENTS.md + docs/ three-tier validated

### Adversarial Review (2026-04-08)

**Value prop:** "Keeps you safe while solo, tells you when you're not, makes the handoff smooth."

**Rationalization traps** (watch for these in your own reasoning):
1. **Layer conflation** — solving problem A, claiming victory over adjacent problem B
2. **"This time is different"** — assuming current model transcends known limits
3. **UX-as-safety** — smoother experience ≠ safer experience; friction can be protective
4. Common thread: watch for "therefore" bridging two different problem domains

**Phase 7-8 action list:** safety floor (mechanical triggers, security scanning, rollback, artifact contracts) → surface simplification (16 skills → 3-4 workflows, observable-fact checkpoints — never evaluative self-assessment) → AGENTS.md governance (40-50 line budget, priority tiers, audit hook triggered every Nth commit) → graduation system (v0 thresholds, calibrated with real-world data, that tell users when to hire help)

**Accepted risk:** The default path through meta-workflows has no independent technical evaluation. Checkpoints verify intent and present observable facts. Technical quality falls to the mechanical safety floor. The gap between "user wanted this" and "this was built well" is partially automated, not human-checked. See Accepted Risks section in the plan.

Full reasoning: `docs/research/2026-04-08-adversarial-review-synthesis.md`
Full plan: `docs/plans/2026-04-08-foundation-phase-7-8-restructure.md`

## Vendored Skills

Soloship used to route to external plugins (CE, Superpowers, Impeccable, ui-ux-pro-max, gstack). As of 2026-04-24, the curated set is **vendored directly into Soloship** so users install one plugin instead of five.

As of v0.5.0 (2026-05-12), source prefixes (`ce-`, `sp-`, `gs-`, `im-`, `uiux-`) were dropped from skill names. Skills now live at `skills/<plain-name>/` and invoke as `/soloship:<plain-name>`. The five 1:1 router→vendored pairs (`debug`, `plan`, `implement`, `learn`, `design-review`) were merged into single skills; the three brainstorming variants were folded into one `/soloship:brainstorm`. Source attribution lives in `THIRD_PARTY_NOTICES.md` and the GitHub README.

Historical source mapping (for archaeology only):
- Compound Engineering (MIT, Kieran Klaassen) — was `ce-`
- Superpowers (MIT, Jesse Vincent) — was `sp-`
- Impeccable (Apache 2.0, Paul Bakaus) — was `im-`
- ui-ux-pro-max (MIT, nextlevelbuilder) — was `uiux-`
- gstack (MIT, Garry Tan) — was `gs-`

Attribution archive lives at `skills/vendored/<source>/` (LICENSE / NOTICE / VERSION / README per source). Full attribution list in `THIRD_PARTY_NOTICES.md`. Upstream source URLs, version pins, and rationale in `docs/plans/2026-04-24-vendored-skill-manifest.md`.

**Known limitations of vendored gstack skills:**
- Disk-path reads (autoplan loads 4 review skills from disk; plan-reviews optionally load office-hours inline) now use a Glob-first / gstack-fallback pattern: try `**/soloship/**/skills/<name>/SKILL.md` first, then `~/.Codex/skills/gstack/<name>/SKILL.md`. Soloship-only users find the vendored copy; users with both installed find either; users with neither fail gracefully with a "skip" message. This is a pattern change — keep it consistent when vendoring future gstack skills with sibling reads.
- Every gstack skill has a bash preamble calling `~/.Codex/skills/gstack/bin/gstack-*` (update check, config, telemetry, session tracking). These fall through via `|| true` for users without gstack, so the skills run but lose telemetry/update/config features. Not worth fixing — these are gstack-ecosystem features that aren't part of Soloship's value prop.
- The `gstack-upgrade` refs in every skill are gated by `UPGRADE_AVAILABLE` output from the update check, which itself requires gstack's bin scripts. Never fires for Soloship-only users — dead code path, safe to leave.

**Sync/drift:** Weekly cron against upstream commits (deferred — not yet built). See the vendoring plan for mechanics.

## Pitfalls

### Pitfall: Counts written in this file and README.md rot silently
_Added by soloship-learn 2026-07-31_

Numbers stated in prose ("46 skills", "18 rules", "25 hooks") have no mechanical
link to the source they describe, so adding a rule or hook never prompts anyone
to update them. On 2026-07-31 this file claimed 43 skills / 14 rules / 10 hooks
against an actual 46 / 18 / 25, and README.md stated two *different* hook counts
in one file while its own enumeration listed a third number. `DOC_COUNT_CHECKS`
in `scripts/validate-plugin-metadata.js` now asserts these against live source at
release time. If you reword a sentence containing one of these counts, the check
fails on purpose — update the pattern, don't delete the check. Full writeup:
`docs/solutions/workflow-issues/documented-counts-drift-when-nothing-asserts-them-20260731.md`.

### Pitfall: There is deliberately no `commands/` directory
_Added by soloship-learn 2026-07-31_

Claude Code resolves `commands/` and `skills/` in one namespace — the plugin
inventory has no separate `Commands (N)` line. A command file sharing a skill's
name shadows the skill, and the workflow becomes unreachable. Soloship shipped 46
such collisions through v0.20.0: every `/soloship:*` returned a 4-line shim and
always-on token cost doubled. Removed in v0.21.0; the validator now blocks
reintroduction. Skills are already user-typable as `/soloship:<name>` — add a
command file only if you want a *different* name than the skill it wraps.

