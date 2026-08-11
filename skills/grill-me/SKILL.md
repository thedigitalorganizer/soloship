---
name: grill-me
description: |
  Relentless pre-plan interview that walks every branch of the design tree until
  user and agent share a complete mental model. Refuses to write a plan or any
  code until alignment is explicit. Use when about to plan something non-trivial,
  when user says "grill me", "interview me", "interrogate me", "stress test this",
  or before invoking /plan on medium-to-large work.

  Adapted from Matt Pocock's `grill-me` (MIT) — see `skills/vendored/pocock/`
  for original and attribution.
---

## Host Compatibility

If you are running this skill in Codex, read `../references/codex-compatibility.md` before following host-specific tool instructions. Claude Code should continue to use the Claude-specific tools and command wrappers described here.

# Soloship Grill Me

Your job is to extract every constraint, edge case, and scope decision the user
has in their head BEFORE any plan exists. Plans get rewritten when reviews catch
what should have been settled at this stage. The fix is to settle it here.

This is the upstream of `/plan`. Run grill-me first, then `/plan`, then `/review`
or `/autoplan`. The interview transcript becomes the rationale doc the plan
references — so a fresh agent after `/clear` can understand WHY each decision
was made.

## Model posture (see .claude/rules/model-mode.md)

**Standard posture** (Opus/Sonnet/Codex — the default): run the interview
exactly as written, every phase in order.

**Fable posture** (model id contains `fable`/`mythos`): the gates are the
alignment checkpoints. Binding: Step 0's tier decision when ambiguous (ask
the user, don't assume) · each phase's explicit "Aligned?" gate in Step 2 —
a yes from the user before moving on · Step 4's refusal to write a plan or
code before final alignment · Step 5's rationale artifact written to
`docs/drafts/` · Step 6's no-auto-invoke of `/plan`.

**Choreography (adaptable in Fable posture):** Step 1's exact reading list,
the six-phase ordering and per-phase question scripts, and Step 3's question
quotas (one-at-a-time, the 5-question cap). Probe in whatever order the
topic demands — but every phase's ground gets covered, and every alignment
gate gets its explicit yes.

## Plain-English Frame (for non-coders)

Grilling is the part where I ask you a lot of questions before we build
anything. It feels slow but it isn't — every question I ask now is a question
that doesn't become a plan rewrite later. The goal is for both of us to be
able to describe the thing in the same words. When we get there, we plan.

## Step 0: Tier Detection — Skip If Trivial

Before grilling, decide if this work even needs an interview.

**Auto-skip (don't grill, just hand off):**
- Single-file mechanical change (rename, format, lint fix)
- Direct continuation of an already-grilled plan
- User explicitly says "just do it" or "skip the interview"

**Offer to skip (recommend brainstorm or direct plan instead):**
- 2-5 files, no architectural decisions
- A bug fix with a clear root cause already identified
- A spike or throwaway prototype

**Full grill (proceed with all phases):**
- 5+ files OR new infrastructure OR data-model changes
- Anything touching auth, payments, migrations, or external integrations
- Any "should we even build this" uncertainty
- User invoked grill-me explicitly

Use `AskUserQuestion` with three options when ambiguous:

> This work looks like it might be small enough to skip the full interview.

- A) Full grill — walk every branch (recommended for non-trivial work)
- B) Quick check — 5-10 questions then hand off
- C) Skip grill — go straight to /plan

## Step 1: Read Before Asking

For ANY question that the codebase can answer, do not ask the user. Use Read,
Grep, Glob, or Bash to look. The user's time is precious; a question they could
have answered "go look at line 42" is a question you should have answered
yourself.

Specifically before grilling, gather:
- Read the project's `CLAUDE.md` and any relevant `AGENTS.md`
- If `docs/architecture/REGISTRY.md` exists, read it for blast radius
- Search `docs/solutions/` for any prior art on the topic (your `solution-search.md`
  rule already requires this)
- `git log --oneline -20` to see recent context
- Read 2-3 files most likely affected

State explicitly what you read before you start asking. This proves you didn't
ask questions whose answers were already on disk.

## Step 2: The Six Phases

Walk these in order. Each phase ends with an explicit alignment gate. Do not
proceed to the next phase until the current one is aligned.

### Phase 1: Premise & Success
- What problem is this actually solving? (Not the symptom — the underlying
  problem.)
- Who is affected? Who notices when it's broken? Who notices when it works?
- What does "done" look like in observable terms? (Not "the feature exists" —
  "X user can do Y in under Z seconds.")
- What's the cost of NOT doing this?
- Is there a smaller version that solves 80% of the problem?

**Gate:** "Aligned on premise?" — yes/no via AskUserQuestion. If no, keep
asking until yes.

### Phase 2: Scope Boundaries
- What's IN scope?
- What's OUT of scope (but tempting)?
- What's adjacent and might pull us off course?
- Are there parts that look related but should be separate plans?
- Walk the codebase blast radius: which files/modules are likely touched?
  Which depend on those? (Read first; ask only if not derivable.)

**Gate:** "Aligned on scope?" — yes/no.

### Phase 3: Data & State
- What data is created, read, updated, or deleted?
- What's the schema before vs after?
- Is there a migration? A backfill? A rollback path?
- Where does state live (DB, R2, KV, in-memory, client)?
- What happens to old data — do we keep it, archive it, drop it?
- What guarantees does this need (consistency, durability, idempotency)?

**Gate:** "Aligned on data model and state?" — yes/no.

### Phase 4: Edge Cases & Failure Modes
- What happens when an external API is down, slow, rate-limited, or returns junk?
- What happens on partial success (half the items processed)?
- What happens on retry — is the operation idempotent?
- What happens at scale (1, 100, 10K, 1M)?
- What's the worst thing that could go wrong if this ships broken?
- What observability proves it's working in production?

**Gate:** "Aligned on edge cases and failure handling?" — yes/no.

### Phase 5: UX & Integration Points
- Who or what triggers this? (User click, cron, webhook, agent.)
- What do they see / receive when it works?
- What do they see / receive when it fails?
- Does this change any URLs, API contracts, public types, or stored data shapes?
- Does this affect any other agent or skill? (Sync with `/onboard`-relevant docs.)

**Gate:** "Aligned on UX and integration?" — yes/no.

### Phase 6: Final Scope Sweep
- Is anything in scope that we just decided isn't really needed?
- Is anything out of scope that probably needs to be in?
- What's the smallest version we'd actually ship?
- What's the largest version that's still defensible?

**This phase is where the highest-leverage scope cuts happen.** Encourage them
explicitly. The user finds bloat the agent can't see.

**Gate:** "Aligned on final scope?" — yes/no.

## Step 3: Question Discipline

- **Ask one question at a time.** Never batch. The user's brain solves the
  current question best when it isn't holding three others.
- **Provide your recommended answer.** Each question ends with "My recommendation:
  X — because Y." The user can accept, reject, or counter. This is faster than
  open-ended questions and forces you to commit to a position.
- **Use `AskUserQuestion`** when the answer is enumerable (yes/no, A/B/C, pick
  one of N). Use plain text questions when the answer needs nuance ("describe
  the user this is for").
- **If the user answers a question with a question, answer their question
  first, then re-ask yours.** Don't drift.
- **If you've asked 5+ questions in one branch with no progress, stop.** Summarize
  what's been said, present your best guess at the answer, ask "Is that close?"

## Step 4: Refuse to Plan Until Aligned

Do not write a plan. Do not write code. Do not invoke `/plan`. Do not invoke
`plan`. Until the user explicitly confirms final alignment via the Phase 6
gate, your only job is to keep grilling.

If the user says "just write the plan" before alignment, push back once:

> We haven't settled [name the unsettled phase]. Writing the plan now means
> we'll rewrite it when review catches what we skipped. Two more questions
> and we're done — okay?

If they say no, comply — but log the deferred decisions in the rationale doc
so a future agent knows what was glossed over.

## Step 5: Write the Rationale Artifact

When alignment is reached, save the interview transcript to:

`docs/drafts/YYYY-MM-DD-<slug>-grill.md`

Format:

```markdown
---
date: YYYY-MM-DD
slug: <slug>
producer: soloship-grill-me
type: rationale
ttl_days: 30
---

# Grill Me — <Topic>

## Premise & Success
[Q&A captured from Phase 1]

## Scope Boundaries
[Q&A from Phase 2]

## Data & State
[Q&A from Phase 3]

## Edge Cases & Failure Modes
[Q&A from Phase 4]

## UX & Integration
[Q&A from Phase 5]

## Final Scope
[Q&A from Phase 6, including any scope cuts]

## Open Decisions Deferred
[Anything user chose not to settle, with consequences noted]

## Handoff Notes
[What the plan needs to carry forward; anything the agent should re-read]
```

This file satisfies the `plan-rationale.md` rule: every plan must carry enough
reasoning that a fresh agent with no context can understand WHY each decision
was made. The grill transcript IS that reasoning.

## Step 6: Hand Off to /plan

Once the rationale doc is written:

> Alignment reached. Rationale saved to `docs/drafts/YYYY-MM-DD-<slug>-grill.md`.
>
> Run `/plan` next. The plan file will reference this rationale doc, and
> `/autoplan` (or `/review`) will read both. Most of the auto-decisions you'd
> normally hit a gate on are now pre-answered.

Do NOT auto-invoke `/plan`. The user controls the next step.

## Plan Mode Safety

If invoked inside Claude Code's plan mode:
- The first `AskUserQuestion` satisfies the end-of-turn requirement
- AskUserQuestion calls do NOT count as plan-mode violations
- Do NOT call `ExitPlanMode` until the user explicitly accepts the rationale
  artifact and authorizes leaving plan mode (or invokes `/plan`)
- Reading files (Read, Grep, Glob, Bash for `git log`) is allowed in plan mode

## Verification

The grill is complete when ALL of these are true:

- [ ] Tier detected; full-grill or skip-with-rationale chosen
- [ ] Codebase context read before any user question
- [ ] All 6 phases walked OR explicit user override on phases skipped
- [ ] Each phase ended with an alignment gate that the user accepted
- [ ] Rationale doc written to `docs/drafts/YYYY-MM-DD-<slug>-grill.md`
- [ ] Handoff to `/plan` offered (not auto-invoked)

## Voice

Plain English first, jargon glossed once.

Do say: "What does the database row look like before this change, and after?"
Don't say: "Walk me through the schema delta and migration semantics."

Do say: "If we ship this and it breaks at 2am, what page goes off?"
Don't say: "What's the observability surface and alerting topology?"

The user is directing AI agents, not writing code. Treat them as a smart
product owner who knows their domain better than you do.

## What This Skill Replaces

- The implicit gap between `/brainstorm` and `/plan` where decisions get
  glossed over and rediscovered later in `/review`
- The "user finds bloat that the skill can't see" pattern (your own logged
  insight from 2026-04-17)
- The 3-review revision loop that older logs show (review caught it → plan
  rewritten → next review caught more)

This skill does NOT replace:
- `/brainstorm` (still upstream — used when WHAT to build is uncertain)
- `/office-hours` (still used when DEMAND is uncertain — should we build at all)
- `/plan` or `plan` (still writes the plan)
- `/review` or `/autoplan` (still catches code-correctness issues this skill can't)

The chain is: `office-hours?` → `brainstorm?` → **`grill-me`** → `plan` →
`autoplan` → `implement` → `review` → `ship`.
