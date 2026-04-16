# Foundation — System Design

**Date:** 2026-04-06
**Author:** Shawn (via Claude Code brainstorming session)
**Status:** Design complete, ready for implementation planning

---

## What Foundation Is

Foundation is a two-part system for non-coders who build software through AI agents (Claude Code). It solves the problem that AI coding is narrowly focused — it generates working code but doesn't understand the system it's building, doesn't follow conventions across sessions, and doesn't think strategically about architecture.

**Two deliverables:**

1. **`npx foundation init`** — An npm package (the installer). Run once per project. Installs mechanical enforcement: Husky, lint-staged, ESLint, Prettier, TypeScript strict mode, claude-guardrails, GitHub Actions CI template, and the Foundation Claude Code plugin. Think of it as the construction crew that pours the foundation and frames the house.

2. **Foundation Claude Code plugin** — The runtime. Provides skills (commands), hooks (enforcement), and agents (parallel workers). The `/audit` command, the `/plan` command, the workflow phase transitions, the enforcement gates. Think of it as the architect, building inspector, and project manager who show up every day after the house is framed.

**How they connect:** The npm package installs the plugin as its final step (adds it to `~/.claude/settings.json`). From that point forward, users interact with Foundation entirely through Claude Code.

**Foundation is a companion**, not a replacement. It sits alongside:
- **Superpowers** — process discipline (brainstorming, debugging, TDD, verification)
- **Compound Engineering** — research + multi-agent review + knowledge compounding
- **Impeccable** — design micro-commands + AI Slop Detection
- **Cherry-picked gstack skills** — QA, security, plan reviews, office-hours, retro

Foundation provides what none of them do: codebase understanding, project setup, and workflow routing that ties them all together.

---

## The User Flow

```
npx foundation init              ← once — install enforcement + plugin

# Existing project path:
/audit                           ← understand and assess the codebase
/bootstrap                       ← configure governance from audit findings

# New project path:
/bootstrap                       ← configure governance from defaults + questions
/brainstorm                      ← define the problem, then design visually
/plan                            ← technical architecture from the design

# Daily workflow (both paths):
/brainstorm → design visually → /plan → /implement → /learn → /ship
```

---

## The Installer: `npx foundation init`

Runs interactively. Asks a few questions, then sets up everything.

### Step 1: Detect or ask about the project
- Is there a `package.json`? → Node/React/TypeScript project
- Is there a `requirements.txt` or `pyproject.toml`? → Python project
- Is there nothing? → New project, ask what they're building
- Ask: "What's this project called?" and "One sentence — what does it do?"

### Step 2: Install mechanical enforcement
- **Husky + lint-staged** — commit quality gates (runs linters on every commit)
- **ESLint + Prettier** — code formatting, configured for detected stack
- **TypeScript strict mode** — if TypeScript project, enables strict compiler checks
- **claude-guardrails** — 15 pre-built safety hooks via `npx`, zero config
- All installed as devDependencies, zero ongoing maintenance

### Step 3: Create folder structure
```
docs/
  plans/                ← implementation plans
  plans/archive/        ← completed plans
  solutions/            ← knowledge compounding library
  architecture/         ← registry + decision records
  architecture/decisions/
  audit/                ← audit reports
```

### Step 4: Scaffold documentation
- **CLAUDE.md** — generated from project answers + detected stack. Includes quick commands, project structure, cross-cutting contracts placeholder
- **AGENTS.md templates** — one per detected source directory
- **docs/SOLUTION_GUIDE.md** — solution doc schema for knowledge compounding
- **CHANGELOG.md** — initialized with first entry (if doesn't exist)

### Step 5: Configure Claude Code
- Writes hooks to `.claude/settings.local.json` (project-level, not global)
- Adds Foundation plugin to `~/.claude/settings.json`
- Creates `.claude/rules/` with core methodology rules

### Step 6: Set up CI
- **GitHub Actions workflow** — runs tests on push, blocks merges on failure
- **ArchUnitTS** — architecture fitness functions with basic rules (generated from audit findings if available, sensible defaults if not). Enforces module boundaries in CI.

### What the installer does NOT do
- Modify source code
- Create tests
- Make architectural decisions
- Install the Foundation plugin skills (that's the plugin's job)

---

## The Plugin: Foundation Runtime

### Skills (15 commands)

#### Tier 1 — Setup & Understanding (Foundation-original)

| Command | Type | What it does |
|---------|------|-------------|
| `/audit` | Custom | Deep 2-phase codebase investigation → report + JSON |
| `/bootstrap` | Custom | Configure project rules/AGENTS.md from audit findings or defaults |
| `/onboard` | Custom | Orientation briefing for new contributors or fresh sessions |

#### Tier 2 — Daily Workflow (routers + compositions)

| Command | Type | Routes to |
|---------|------|-----------|
| `/brainstorm` | Router | gstack:office-hours (product) or Superpowers:brainstorming (technical). Ends with nudge: "Design what it looks like before you plan how to build it." |
| `/plan` | Composition | Superpowers:writing-plans or gstack:plan-eng-review + enforcement gate (Key Decisions, Why lines, Execution Strategy required) |
| `/implement` | Router | Superpowers:subagent-driven or parallel-agents based on task independence |
| `/review` | Composition | For plans: gstack:plan-{eng,ceo,design}-review. For code: CE conditional agents + adversarial subagent + strategic review |
| `/debug` | Router | Superpowers:systematic-debugging (4-phase: investigate → analyze → hypothesize → implement). Iron law: no fixes without root cause. |
| `/learn` | Composition | CE:workflows:compound (solution doc) + architecture registry audit |
| `/shipfast` | Custom | Lint → test → build → commit → push → **deploy**. Emergency path — something's broken in prod, get the fix live NOW. |
| `/shipthorough` | Composition | Full pipeline: review, coverage audit, registry update, CHANGELOG, plan cleanup, Frill sync, bisectable commits, PR, verification → **deploy**. Due diligence path. |

#### Tier 3 — Specialized (occasional use)

| Command | Type | Routes to |
|---------|------|-----------|
| `/qa` | Router | gstack:qa (headless browser testing) |
| `/security` | Router | gstack:cso (OWASP/STRIDE security audit) |
| `/design-review` | Composition | gstack:design-review + Impeccable AI Slop Detection + Chrome DevTools visual verification |
| `/retro` | Router | gstack:retro (weekly retrospective) |
| `/spec` | Custom | Lightweight formal specification with acceptance criteria (for rare cases needing formal specs) |

#### Planning Depth Ladder

```
Level 1: Quick fix, single file
  → just fix it → /shipfast

Level 2: Small feature, clear scope
  → /plan (routes to Superpowers:writing-plans)
  → /implement → /shipthorough

Level 3: Unclear scope, "should we build this?"
  → /brainstorm (routes to gstack:office-hours or Superpowers:brainstorming)
  → design visually (Stitch, Figma, sketches)
  → /plan (routes to Superpowers:writing-plans or gstack:plan-eng-review)
  → /implement → /shipthorough

Level 4: Big feature, architectural change
  → /brainstorm → design visually
  → /plan → /review (plan: eng, CEO, design reviews)
  → /implement → /review (code) → /learn → /shipthorough
```

---

## The Audit Tool: `/audit`

The centerpiece. Two-phase investigation with a human checkpoint in between.

### Phase 1: Understand the System

Runs agents to map the codebase. Must complete before assessment.

| Agent | What it investigates |
|-------|---------------------|
| Architecture Agent | Dependency graph (madge), circular dependencies, orphan files, module boundaries, import depth, C4 levels 1-3 |
| Convention Agent | Naming patterns, file organization, error handling style, state management approach, existing conventions |
| Decision Archaeology Agent | Git history analysis, existing documentation (CLAUDE.md, AGENTS.md, ADRs), commit message patterns, WHY things are the way they are |
| Documentation Infrastructure Agent | What exists today: CLAUDE.md? AGENTS.md? CI pipeline? Tests? Changelog? Solution docs? Architecture docs? |

### Comprehension Checkpoint

After Phase 1 completes, the audit pauses and presents:

**"Here's what I think this project is:"**
- One paragraph: what the project does and who it's for
- Component table: each major piece, what it does, why it exists — plain language, no jargon
- Key relationships: "X depends on Y because Z"

**The user confirms or corrects.** Structured, not open-ended:
- "Is this right? If something's wrong, tell me which component I misunderstood."
- Corrections get recorded as **intent/implementation misalignment** findings — often the highest-severity issues in the entire audit.

### Phase 2: Assess the System

Runs with the corrected understanding from the checkpoint. Agents run in parallel.

| Agent | What it assesses |
|-------|-----------------|
| Code Quality Agent | File/function size (Metz rules: classes ≤100 lines, methods ≤5 lines, ≤4 params), complexity hotspots, duplication, dead code, Ousterhout deep vs shallow modules |
| Entanglement Agent | Hickey's complecting — where are concerns interleaved that shouldn't be? Tight coupling, hidden dependencies, modules that know too much about each other |
| Security Agent | Exposed secrets scan, injection risks, auth pattern review, OWASP basics |
| Dependency Agent | Outdated packages, known CVEs, unused dependencies, bundle size analysis |
| Gap Agent | Missing tests, missing types, missing error boundaries, missing docs, AGENTS.md coverage gaps |
| Leverage Point Agent | Meadows — top 5 changes that would have the biggest positive impact on the system. Informed by all other agents' findings. |

### Audit Output

Two files:

**`docs/audit/AUDIT-YYYY-MM-DD.md`** — Human report:
```
1. What This Project Is (confirmed summary)
2. System Map (top-level Mermaid diagram + component table)
3. What's Working Well (strengths to preserve)
4. How It's Built (detected conventions)
5. Documentation Infrastructure (what exists today)
6. Findings (by severity: Critical → High → Medium → Low,
   with git history context enriching each finding)
7. Top 5 Recommendations (highest-impact changes)
8. Recommended Rules (5-7 for humans, full list in JSON)
```

**`docs/audit/audit-findings.json`** — Machine-readable:
- Severity scores per category
- File lists per finding
- Detected stack and conventions
- Recommended rules as structured data
- Component registry seed data
- Full recommendations list (beyond the top 5-7 in human report)

`/bootstrap` reads this JSON to auto-configure instead of asking questions.

---

## `/bootstrap` — Configuring Governance

The bridge between "I understand my codebase" and "my codebase is governed."

### Two modes

**Mode A: Audit-informed** (ran `/audit` first)
- Reads `docs/audit/audit-findings.json`
- Already knows stack, conventions, components, gaps, documentation infrastructure
- Presents summary: "Based on the audit, here's what I'm going to set up. Approve?"
- User approves or adjusts, then executes

**Mode B: Fresh project** (no audit)
- Asks 4-5 questions: What's the project? What stack? Repo structure? Existing conventions?
- Uses sensible defaults for everything else
- Executes immediately

### What it creates/configures

**1. CLAUDE.md** — Generated or updated. Tailored to actual project.
- Project description (from audit or answers)
- Quick commands (detected from package.json or asked)
- Project structure (from actual file tree)
- Key files table
- Cross-cutting contracts (detected from import analysis or placeholders)
- Workflow section pointing to Foundation commands

**2. AGENTS.md files** — One per major directory.
- Scope description (what this directory owns)
- Contracts (what other code depends on from here)
- Populated from audit component table if available, templated if not

**3. Documentation infrastructure** — Only creates what's missing.
- `docs/plans/` and `docs/plans/archive/`
- `docs/solutions/` with category subdirectories
- `docs/architecture/` with REGISTRY.md seed and `decisions/` folder
- `CHANGELOG.md` if it doesn't exist
- `docs/SOLUTION_GUIDE.md`

**4. Mechanical enforcement** — Project-specific hook configuration.
- ESLint rules tuned to detected conventions (not fighting the codebase)
- Hook configuration in `.claude/settings.local.json`
- Audit-recommended hooks (e.g., secrets-scanning if audit found secrets in code)

**5. Rules** — `.claude/rules/` files, only the ones that apply.
- Core rules always installed: plan materialization, plan rationale, solution search
- Stack-specific rules only if relevant (e.g., report content rules only for PDF projects)
- Audit-recommended rules: if audit found a pattern (e.g., "services always throw on error"), it becomes a rule

### What it does NOT do
- Install npm packages (that's the npm installer's job)
- Modify source code
- Create tests
- Make architectural decisions

### Post-bootstrap nudge

Based on context:

- **Audit found critical issues:** "Setup complete. Your audit found 3 critical findings. Run `/plan` to address them before building new features on a shaky foundation."
- **Fresh project:** "Setup complete. Before you start building, think through your architecture. Run `/brainstorm` to explore what you're building and why, then design what it looks like. The time you spend here saves 10x in rework later."
- **Audit was clean:** "Setup complete. Your codebase is in good shape. When you're ready for your next feature, start with `/brainstorm`."

Every path points to thinking first. Never to "start coding."

---

## Hooks & Enforcement

The mechanical layer that works on the worst ADHD day.

### Hook inventory

| Hook | Event | What it does |
|------|-------|-------------|
| claude-guardrails (15 rules) | PreToolUse | Block dangerous commands: `rm -rf` with home paths, `.env` edits, force pushes, hardcoded API keys |
| Auto-lint | PostToolUse (file edit) | Run linter on changed file |
| CHANGELOG check | PostToolUse (commit) | Warn if `feat:`/`fix:`/`refactor:` commit lacks CHANGELOG entry |
| Dependency graph | Stop | Regenerate madge → `.ai/deps.json` (only if .ts/.tsx files changed) |
| Plan validation | Stop | Check plan files for Key Decisions + Why lines (presence, not quality) |
| Workflow navigator | Stop | Read state of work, suggest next Foundation command |
| Handoff reminder | Stop | After sustained work, nudge to write state-of-work + next-tiny-action |
| Context injection | SessionStart | Inject `.ai/deps.json` into context (~200-400 tokens) |
| Architecture fitness | CI (GitHub Actions) | ArchUnitTS rules enforcing module boundaries |

### What hooks DON'T do
- Enforce judgment calls (is this good architecture? is this simple?)
- Chain workflow phases (hooks can't trigger slash commands)
- Replace skills (intelligence lives in the plugin, not the hooks)
- Quality-check plans (presence checking only — quality is the skill's job)

### Key hook design decisions

- **madge only runs when needed** — checks `git diff` for .ts/.tsx changes before regenerating
- **CHANGELOG check is a warning, not a block** — only for feat:/fix:/refactor: prefixes, doesn't annoy on docs:/chore:/test: commits
- **Workflow navigator is a suggestion, not a gate** — "You just finished planning. Design what it looks like, then run `/implement`." User can ignore it.
- **Handoff reminder prevents blank-page restarts** — the ADHD shutdown ritual from the research, automated so the user doesn't have to remember

---

## Cherry-picked gstack Skills (kept as symlinks)

These gstack skills stay installed and are routed to by Foundation commands:

| Skill | Routed to by | Why it's valuable |
|-------|-------------|-------------------|
| office-hours | `/brainstorm` | 6 forcing questions for product/direction thinking |
| plan-eng-review | `/plan` | Architecture review for complex features |
| plan-ceo-review | `/review` | Scope/strategy review for big decisions |
| plan-design-review | `/review` | UI/UX gap analysis for frontend work |
| design-review | `/design-review` | Visual design audit checklist |
| qa | `/qa` | Headless browser QA testing |
| browse | `/qa` | Browser automation for testing |
| cso | `/security` | OWASP/STRIDE security scanning |
| retro | `/retro` | Weekly retrospective |
| investigate | `/debug` (fallback) | Root cause investigation |
| review | `/shipthorough` (patterns) | Pre-landing code review |
| design-consultation | kept as-is | Design system creation |

---

## Retirements

| What | Action | Reason |
|------|--------|--------|
| GSD commands (`~/.claude/commands/gsd/`) | Move to `~/skills-retired/` | 50+ commands, all redundant |
| GSD agents (`~/.claude/agents/gsd-*.md`) | Move to `~/skills-retired/` | 17 agent types, unused |
| Unused gstack symlinks | Remove from `~/.claude/skills/` | autoplan, benchmark, canary, careful, checkpoint, codex, connect-chrome, document-release, freeze, guard, gstack-upgrade, health, land-and-deploy, setup-browser-cookies, setup-deploy, unfreeze |
| SpecKit references | Remove from compound-workflow.md | Not installed (hardcoded phantom) |
| Brand references | Remove from workflow rules | Not installed (hardcoded phantom) |

**Kept but not managed by Foundation:**
- Superpowers plugin (foundation discipline)
- Compound Engineering plugin (research + review)
- Impeccable plugin (design micro-commands)
- Custom email/email-briefing skills
- Custom quality skills

---

## Methodology Integration

### The Three-Layer System (from research)

| Layer | What Foundation provides | Maintenance |
|-------|------------------------|-------------|
| **Layer 1: Mechanical Enforcement** | Hooks, CI, TypeScript strict, Husky, lint-staged, claude-guardrails, ArchUnitTS | Zero — set up once, never think about it |
| **Layer 2: Architectural Infrastructure** | CLAUDE.md, AGENTS.md files, docs/ structure, madge dependency graph, ADRs, solution library | Lightweight — updated as side effect of shipping |
| **Layer 3: Strategic Design** | /brainstorm, design-first nudge, planning depth ladder, /plan enforcement gates | Active — the human's irreplaceable contribution |

### Design-First Principle

The research found that real product teams (Apple, Google, Stripe) start with design, not architecture. Foundation enforces this:

- `/brainstorm` ends with: "You know what you're building. Now design what it looks like before you plan how to build it. Use Stitch, Figma, or sketch it on paper. When you can see it, run `/plan`."
- No `/design` command — Foundation doesn't own design tools. It makes sure you don't skip the step.

### Knowledge Compounding

Every significant piece of work produces a solution doc via `/learn` → CE:workflows:compound. These accumulate in `docs/solutions/` and are searched before every planning session (via the solution-search rule and `/plan` Step 3). The audit tool can also read existing solution docs to understand project history.

---

## Known Limitations

1. **Phantom skills (SpecKit + Brand)** — hardcoded in Claude Code system prompt. Cannot be deregistered. ~16 phantom descriptions consuming ~4,000 tokens per conversation. Documented, not fixable.

2. **madge is JS/TS only** — Python projects would need `pydeps` or `import-linter` for dependency tracking. Foundation v1 supports JS/TS stacks. Architecture supports adding other stacks later.

3. **Hooks can't enforce judgment** — Hooks see the filesystem, not Claude's reasoning. They can check "does this file contain X?" but not "is this a good design?" Quality judgment stays in skills.

4. **gstack preamble overhead** — Cherry-picked gstack skills still load ~60 lines of preamble per invocation. Tolerated for occasional-use skills (QA, security). Could be stripped in v2 by writing custom wrappers.

5. **Plugin updates may break routing** — If Superpowers or CE rename/restructure skills, Foundation routers that reference them by name will break. Mitigation: pin plugin versions, test routing after updates.

---

## Key Decisions

1. **Companion, not replacement.** Foundation sits alongside Superpowers, CE, Impeccable, and cherry-picked gstack. Doesn't rebuild what already works — builds what's missing.
   - *Why:* Superpowers and CE are maintained by active teams and provide proven value (82 plans, 60 solution docs). Rebuilding them would be expensive and lose upstream improvements.

2. **npm installer + Claude Code plugin.** Two-part delivery with separation of concerns.
   - *Why:* The installer handles one-time mechanical setup (packages, CI). The plugin handles ongoing intelligence (skills, hooks, routing). Different jobs, different tools.

3. **Audit before bootstrap (for existing projects).** Understanding before governing.
   - *Why:* Hickey's principle — understand the system before acting on it. Bootstrap without audit produces generic rules that may fight the codebase's existing conventions.

4. **Comprehension checkpoint with human confirmation.** The audit pauses and explains what it thinks the project is.
   - *Why:* The gap between code intent and code implementation is often the highest-severity finding. Only the human knows the intent.

5. **Design-first, not architecture-first.** `/brainstorm` nudges toward visual design before `/plan`.
   - *Why:* Industry standard (Apple, Google, Stripe). You can't plan architecture until you know what you're building, and you don't know until you can see it.

6. **Workflow navigator as suggestion, not gate.** Stop hook suggests next command but doesn't force it.
   - *Why:* Forced workflows create friction that ADHD users will abandon. Suggestions create a "pit of success" — the right path is the easiest path.

7. **Handoff reminder as automated ritual.** Stop hook nudges Claude to write state + next action.
   - *Why:* Research finding — the blank-page restart is the #1 ADHD productivity killer. Automating the shutdown ritual means neither the human nor the AI needs to "remember."

8. **Rules kept mandatory, commands add enforcement.** Belt + suspenders.
   - *Why:* Adversarial review found that demoting rules to "reference" creates an enforcement gap for non-command workflows (natural language requests that don't invoke a skill).

9. **Top 5 recommendations, not exhaustive list.** Human report caps at 5-7 items. Full list in JSON.
   - *Why:* 30 recommendations is paralyzing for an ADHD user. 5 is actionable. `/bootstrap` handles the rest silently.

10. **madge for v1, architecture supports upgrades.** Start simple, graduate to RepoMapper or Graqle when needed.
    - *Why:* madge is mature (npm), zero-config, and produces output that fits in ~200-400 tokens. Good enough until the project outgrows it.

---

## Execution Strategy

This is a large plan — multiple phases, 15+ skills to write, hooks to configure, npm package to build. Recommended approach: **phased subagent-driven execution**.

| Phase | Work | Deliverables |
|-------|------|-------------|
| 1. Retire & clean | Remove GSD, prune unused gstack symlinks, fix phantom references | Clean skill registry |
| 2. Build npm installer | CLI package with interactive setup, mechanical enforcement installation | `npx foundation init` working |
| 3. Build audit tool | 10 investigation agents, comprehension checkpoint, report generation | `/audit` producing reports |
| 4. Build bootstrap | Two modes (audit-informed + fresh), CLAUDE.md/AGENTS.md generation | `/bootstrap` configuring projects |
| 5. Build workflow commands | 12 router/composition/custom commands | All Tier 2 + 3 skills working |
| 6. Configure hooks | All 9 hooks in settings template | Enforcement layer active |
| 7. Integration test | Run full flow on MAPS project (existing) + fresh project | End-to-end verification |
| 8. Documentation | Methodology page for aifoundationlevels.com | Teaching material |

Each phase is a separate session with `/clear` between phases. Phase handoffs via this document + per-phase notes appended below.

---

## Handoff

- **Phase completed:** Design (brainstorming)
- **What was done:** Complete system design for Foundation — installer, plugin, audit tool, bootstrap, 15 commands, hooks, integration with existing plugins
- **Output:** This file (`docs/plans/2026-04-06-foundation-system-design.md`)
- **Next step:** `/clear` → Implementation planning per Execution Strategy above. Start with Phase 1 (retire & clean) as it's zero-risk and clears the decks.
- **Context for next agent:** All research is in `docs/methodology/systematic-programming-research.md`. Prior skill audit at `docs/plans/2026-04-02-skill-audit-findings.md`. Prior review synthesis at `docs/plans/2026-04-03-skill-audit-review-synthesis.md`. The plan at `~/.claude/plans/expressive-sniffing-acorn.md` has the original command specifications with detailed routing logic — use it as reference for Phase 5.
