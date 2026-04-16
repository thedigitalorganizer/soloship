# Skill Ecosystem Audit & Custom Workflow Design

## Context

Shawn has accumulated skills from 7+ sources (Superpowers, Compound Engineering, SpecKit, GSD, gstack, Impeccable, Brand, plus custom skills) totaling 100+ slash commands. Many overlap, some conflict, and the routing confusion undermines the value of any individual skill.

The goal: audit everything, design custom slash commands that route to the right existing skills, bake enforcement into the commands (not passive rules), introduce an architecture registry for systems-level thinking, and retire unused skills.

## Decisions (Accumulated)

1. **Checkpoint after Phase 2.** Phases 1-2 done. Phase 3 (design) informed by Shawn's feedback.
2. **Scope: workflow skills only.** Domain-specific skills stay as-is.
3. **Routers, not rewrites.** Custom commands dispatch to existing plugin skills. Only write custom logic where no plugin fits.
4. **Enforcement baked into commands.** Rules (plan-rationale, plan-materialization, etc.) aren't followed consistently as passive docs. Their requirements become hard gates inside custom commands.
5. **Planning depth ladder.** Not everything routes to Superpowers. gstack office-hours, plan-eng-review, plan-ceo-review are first-class planning tools for bigger work.
6. **Retire to `~/skills-retired/`.** Unused skills moved out of active registry, easy to restore.
7. **Phantom investigation done.** SpecKit + Brand are hardcoded in Claude Code (can't remove). GSD deregistrable by moving `~/.claude/commands/gsd/` and `~/.claude/agents/gsd-*.md`.
8. **Architecture Registry (REGISTRY.md).** Indexed component + decision system that makes systems thinking mechanical, not aspirational. Maintained as side effect of shipping, not separate task.

---

## Phase 3: Design (Current Phase)

### 3A: Architecture Registry

**What:** `docs/architecture/REGISTRY.md` — a lightweight index (~100-150 lines) of components, dependencies, and decisions. Detail files in `docs/architecture/decisions/` for the "why" behind major choices.

**Format:**
```
## Components
| ID  | Name              | Scope          | Depends On   | Depended By  | Decisions |
|-----|-------------------|----------------|--------------|--------------|-----------|
| C01 | claudeService     | AI pipeline    | C02,C03,C08  | C04,C05      | D01       |
| C02 | types.ts          | Type system    | —            | C01,C04,C06  | —         |
| ...

## Decisions  
| ID  | Date    | Title                      | Status | Components |
|-----|---------|----------------------------|--------|------------|
| D01 | 2025-12 | 4-chapter sequential gen   | Active | C01        |
| ...
```

**Decision detail files:** `docs/architecture/decisions/D01-four-chapter-generation.md`
- Context (why), Status (active/superseded), Components affected, Consequences, Alternative rejected

**How it's maintained (iron-clad):**
- `/shipthorough` auto-updates REGISTRY.md from the diff (same commit as code)
- `/learn` audits the registry for drift, stale entries, bloat (after-action cleanup)
- `/plan` reads REGISTRY.md as Step 1 to identify affected components and dependencies
- Stale registry → wrong dependency checks → broken planning (self-reinforcing incentive)

**Bootstrap:** One-time Explore agent reads AGENTS.md files, traces imports, reads `docs/plans/archive/` and `docs/solutions/` to extract decisions. Generates initial REGISTRY.md + decision files.

**AGENTS.md files stay** but gain a one-line cross-reference: `Registry: C01, C02, C03 | Decisions: D01, D02`

---

### 3B: Custom Command Design

Each command is typed as **Router** (dispatches to existing skill), **Composition** (combines skills + enforcement), or **Custom** (original logic).

#### Planning Depth Ladder

```
Level 1: No plan — quick fix, single file → just do it → /shipfast

Level 2: Lightweight plan — small feature, clear scope
  → /plan routes to Superpowers:writing-plans
  → Enforcement gate checks compliance
  
Level 3: Explore first — unclear scope, "should we build this?"
  → /brainstorm routes to gstack:office-hours (product) or Superpowers:brainstorming (technical)
  → /plan routes to Superpowers:writing-plans OR gstack:plan-eng-review
  → Enforcement gate

Level 4: Full pipeline — big feature, architectural change
  → /brainstorm → gstack:office-hours
  → /plan → gstack:plan-eng-review (architecture)
  → /plan-review → gstack:plan-ceo-review (scope/strategy, optional)
  → /plan-review → gstack:plan-design-review (if UI-heavy, optional)
  → Enforcement gate
  → /shipthorough
```

#### Command Specifications

**`/brainstorm`** — Type: Router (~80 lines)
- Assess: product/direction question → gstack:office-hours (6 forcing questions)
- Assess: technical approach question → Superpowers:brainstorming (incremental dialogue)
- Assess: "should we build this?" → gstack:office-hours
- Output: design doc in `docs/plans/YYYY-MM-DD-<topic>-design.md`

**`/plan`** — Type: Composition (~200 lines)
- Step 1: Read REGISTRY.md, identify components in scope
- Step 2: Follow dependency links, flag all affected components
- Step 3: Search `docs/solutions/` for prior art on touched components
- Step 4: Route to planning skill based on depth:
  - Small (< 5 files, clear scope) → Superpowers:writing-plans
  - Architectural (data flow, new services, schema changes) → gstack:plan-eng-review
- Step 5: **Enforcement gate** (hard fail, not aspirational):
  - □ Plan file written to `docs/plans/YYYY-MM-DD-<slug>.md`?
  - □ Each phase/step has a "Why:" line?
  - □ Key Decisions section exists?
  - □ Execution Strategy section exists?
  - □ All dependent components (from REGISTRY.md) addressed?
  - □ No prior pitfalls (from solution search) left unaddressed?
  - FAIL → fix before proceeding. No exceptions.

**`/implement`** — Type: Router (~80 lines)
- Sequential tasks or shared files → Superpowers:subagent-driven
- Parallel independent modules → Superpowers:dispatching-parallel-agents
- Simple single task → direct implementation (no orchestration overhead)

**`/review`** — Type: Composition (~250 lines)
- For PLANS: route to gstack:plan-ceo-review, plan-eng-review, plan-design-review (user picks or all via autoplan)
- For CODE: combine three passes:
  1. CE conditional agents (schema-drift-detector if migrations, security-sentinel if auth)
  2. gstack adversarial subagent (fresh context, find ways it breaks in production)
  3. Strategic review: read REGISTRY.md, check if change simplifies or complicates system, flag dead code
- Design-review-lite if frontend files changed (gstack checklist + impeccable AI Slop Detection)

**`/learn`** — Type: Composition (~150 lines)  
- Step 1: Route to CE:workflows:compound (capture solution doc)
- Step 2: **Registry audit** (after-action review):
  - Read REGISTRY.md
  - Compare against current codebase state
  - Flag stale entries (components that no longer exist)
  - Flag missing entries (new components not tracked)
  - Flag dependency drift (imports changed, registry not updated)
  - Flag superseded decisions
  - Clean up and commit registry updates

**`/shipfast`** — Type: Custom (~60 lines)
- Lint → Test → Build → Commit → Push
- Stop on first failure
- No review, no coverage audit, no PR body
- For: quick fixes, single-file changes, documentation

**`/shipthorough`** — Type: Composition (~400-500 lines)
Cherry-picked from gstack/ship, stripped of overhead:
- Step 1: Pre-flight (branch check, diff stats)
- Step 2: Merge base branch
- Step 3: Run tests + test failure ownership triage (in-branch vs pre-existing)
- Step 4: Coverage audit (AI-assessed, ASCII diagrams, gap detection)
- Step 5: Pre-landing review (structured + adversarial subagent — no Codex, no Greptile, no GitLab)
- Step 6: **Registry update** (read diff, update REGISTRY.md components + dependencies, add decision records for Key Decisions from plan)
- Step 7: Version bump + CHANGELOG
- Step 8: Plan lifecycle cleanup (small → delete, large → archive)
- Step 9: Frill sync (if feat: or fix:)
- Step 10: Bisectable commits
- Step 11: Verification gate (re-run tests if code changed during review fixes)
- Step 12: Push + create PR (structured body with coverage, review, plan completion, registry changes)
- NO: preamble, telemetry, voice rules, platform detection, test framework bootstrap, Codex, Greptile, GitLab, TODOS.md management, "Boil the Lake"

**`/debug`** — Type: Router (~60 lines)
- Route to Superpowers:systematic-debugging (4-phase: investigate → analyze → hypothesize → implement)
- Iron law: no fixes without root cause investigation
- On completion: suggest `/learn` if fix was non-obvious

**`/qa`** — Type: Router (~40 lines)
- Route to gstack:qa (headless browser QA)
- Tolerate gstack preamble (occasional-use skill, overhead acceptable)

**`/security`** — Type: Router (~40 lines)
- Route to gstack:cso (OWASP/STRIDE)
- Tolerate gstack preamble

**`/design-review`** — Type: Composition (~150 lines)
- gstack design-review checklist
- Impeccable AI Slop Detection checklist
- Chrome DevTools MCP visual verification

**`/retro`** — Type: Router (~40 lines)
- Route to gstack:retro (weekly retrospective)

**`/spec`** — Type: Custom (~120 lines)
- Lightweight formal specification (since SpecKit isn't installed)
- Acceptance criteria, data models, API contracts
- For Level 5 planning depth (rare, multi-team coordination)

**`/onboard`** — Type: Custom (~100 lines)
- Codebase mapping + orientation
- Reads REGISTRY.md, AGENTS.md files, recent git history
- Produces a briefing for a new contributor or a fresh session

---

### 3C: Workflow Rules Update

**compound-workflow.md** — rewrite to reference custom commands:
```
Decision tree:
  Bug? → /debug → fix → /learn (if non-obvious) → /shipfast or /shipthorough
  Small non-bug? → fix → /shipfast
  Unclear scope? → /brainstorm → /plan → /implement → /learn → /shipthorough
  Big feature? → /brainstorm → /plan → /review (plan) → /implement → /review (code) → /learn → /shipthorough
```

**Planning rules** (plan-rationale.md, plan-materialization.md, plan-lifecycle.md):
- Keep as reference documentation for humans
- Their ENFORCEMENT moves into `/plan`'s compliance gate and `/shipthorough`'s lifecycle cleanup
- Rules become "here's the standard" docs, commands become "here's the enforcement"

**solution-search.md:**
- Stays as rule (it's lightweight and works as ambient behavior)
- Also enforced in `/plan` Step 3

**coding-conventions.md, typography-styles.md, report-content.md:**
- Stay as-is (coding standards, not workflow — out of scope)

---

### 3D: Retirement Plan

**Move to `~/skills-retired/`:**

| What | Source | Why Retiring |
|------|--------|-------------|
| GSD commands | `~/.claude/commands/gsd/` | 50+ commands, all redundant with custom pipeline |
| GSD agents | `~/.claude/agents/gsd-*.md` | 17 agent types, not needed |
| GSD system | `~/.claude/get-shit-done/` | Full GSD installation |
| gstack unused symlinks | `~/.claude/skills/` (symlinks to gstack/) | Skills not routed to by any custom command |

**gstack symlinks to REMOVE** (not routed to by any custom command):
- autoplan, benchmark, canary, careful, checkpoint, codex, connect-chrome, design-html, design-shotgun, document-release, freeze, guard, gstack-upgrade, health, land-and-deploy, learn (gstack's, not ours), setup-browser-cookies, setup-deploy, unfreeze

**gstack symlinks to KEEP** (routed to by custom commands):
- browse, cso, design-consultation, design-review, investigate, office-hours, plan-ceo-review, plan-design-review, plan-eng-review, qa, qa-only, retro, review, ship (reference only — /shipthorough is custom but may reference patterns)

**Plugins to keep active** (in settings.json `enabledPlugins`):
- Superpowers — foundation discipline, routed to by /brainstorm, /plan, /implement, /debug
- Compound Engineering — research + multi-agent review, routed to by /review, /learn

**Phantom skills (can't remove):**
- SpecKit (9 commands) — hardcoded in Claude Code
- Brand (7 commands) — hardcoded in Claude Code
- Document as known limitation

**Remove SpecKit references** from compound-workflow.md (references non-existent skills).

---

### 3E: Migration Order

1. Create `~/skills-retired/` directory
2. **Bootstrap REGISTRY.md** — Explore agent reads codebase, generates initial registry
3. Move GSD to retired (`~/.claude/commands/gsd/`, `~/.claude/agents/gsd-*.md`, `~/.claude/get-shit-done/`)
4. Remove unused gstack symlinks (move to `~/skills-retired/gstack-unused/`)
5. Write custom command SKILL.md files to `~/.claude/skills/custom/<command>/`
6. Rewrite `compound-workflow.md` with new command references
7. Update CLAUDE.md Unified Workflow section
8. Update coding-conventions.md `/ship` reference → `/shipfast` or `/shipthorough`
9. **Verify:** invoke each custom command, confirm routing works, confirm retired skills don't appear in listings

---

## Execution Strategy

| Step | Work Style | Deliverable |
|------|-----------|-------------|
| Bootstrap REGISTRY.md | Explore agent (parallel: trace imports, read AGENTS.md, extract decisions from archives) | `docs/architecture/REGISTRY.md` + decision files |
| Write router commands (8) | Parallel subagents — each command is independent | `/brainstorm`, `/implement`, `/debug`, `/qa`, `/security`, `/retro`, `/onboard`, `/spec` |
| Write composition commands (4) | Sequential — these are more complex and reference each other | `/plan`, `/review`, `/learn`, `/shipthorough` |
| Write custom command (1) | Direct | `/shipfast` |
| Execute retirement | Single cleanup agent | Move files, remove symlinks |
| Update workflow rules | Direct | compound-workflow.md, CLAUDE.md |
| Verify | Manual testing | Invoke each command, check listings |

## Key Decisions

1. **Routers, not rewrites.** Custom commands dispatch to existing plugin skills. Only write custom logic where no plugin fits (enforcement gates, registry updates, /shipfast).

2. **Architecture Registry is load-bearing.** REGISTRY.md isn't documentation — it's infrastructure. /plan reads it, /shipthorough updates it, /learn audits it. If it rots, the workflow breaks. That's the incentive.

3. **Registry maintained as side effect of shipping.** /shipthorough updates REGISTRY.md from the diff in the same commit as code changes. /learn audits for drift. Never a separate documentation task.

4. **Enforcement in commands, not rules.** Planning rules (rationale, materialization, lifecycle) become hard gates inside /plan and /shipthorough. The rule files stay as human-readable reference, but the commands do the actual checking.

5. **Planning depth ladder replaces one-size-fits-all.** /brainstorm routes to gstack:office-hours for product questions, Superpowers for technical. /plan routes to Superpowers for small work, gstack:plan-eng-review for architectural.

6. **Retire to ~/skills-retired/, don't delete.** GSD was useful on another project. Easy to restore by moving back.

7. **Phantom skills are a known limitation.** SpecKit + Brand hardcoded in Claude Code, can't remove.

8. **Systems thinking is pre-computed, not aspirational.** Instead of a rule saying "think about dependencies," the registry stores dependencies as structured data. Commands query it mechanically. The thinking happens when registry entries are created/updated during /shipthorough and /learn.
