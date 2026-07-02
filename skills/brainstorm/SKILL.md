---
name: brainstorm
description: |
  Explore what you're building before planning. Merges Compound Engineering's
  feature-exploration methodology with Superpowers' brainstorming discipline
  into one flow. For pure demand-validation questions, use /soloship:office-hours
  instead. Ends with a nudge to design visually before running /soloship:plan.
---

## Host Compatibility

If you are running this skill in Codex, read `../references/codex-compatibility.md` before following host-specific tool instructions. Claude Code should continue to use the Claude-specific tools and command wrappers described here.

# Soloship Brainstorm

Your job is to help the user think through what they're building before they
plan how to build it.

## Step 1: Determine the Type of Question

Ask yourself: is this a **demand** question or a **feature** question?

**Demand questions** — "should we build this at all?", "who is this for?", "is
this the right direction?", business model, market fit, narrowest wedge.
These are founder-level validations before committing engineering effort.

**Feature questions** — "what should this feature do?", "how should we approach
this?", "React or Vue?", implementation trade-offs, data modeling, API design,
requirements exploration for something you've already decided to build.

## Step 2: Route

**For demand questions:**
For pure demand-validation questions, invoke `/soloship:office-hours` instead — it uses 6 forcing questions that expose demand
reality, status quo, and the narrowest wedge. Use this only when the *existence*
of the feature is in question.

**For feature questions:**
Apply the feature-exploration methodology below. It runs a full
collaborative dialogue that covers requirements clarity, repository research,
approach exploration, and YAGNI trade-offs, and writes the output to
`docs/brainstorms/`.

**If unclear:** Default to feature brainstorming. `office-hours` is reserved for
genuine "should this exist" moments; most sessions are about shaping a feature
the user has already committed to.

## Step 3: Design-First Nudge

After brainstorming concludes and you have clarity on WHAT to build, present
this before suggesting /plan:

> You know what you're building. Now design what it looks like before you plan
> how to build it. Use Stitch, Figma, or sketch it on paper. When you can see
> it, run `/plan`.

This is not optional. Real product teams (Apple, Google, Stripe) start with
design, not architecture. You can't plan how to build something until you can
see what you're building.

## Step 3.5: Grill-Me Nudge (for medium-or-larger work)

After design exists but BEFORE `/plan`, suggest `/grill-me` when the work is
non-trivial:

> Before planning, run `/grill-me`. It walks every branch of the design tree
> — premise, scope, data, edge cases, UX, final scope — and saves the rationale
> as a sibling doc the plan will reference. Plans grilled first need fewer
> review revisions later.

**When to suggest:**
- 5+ files OR new infrastructure OR data-model changes
- Auth, payments, migrations, or external integrations
- Anything where a wrong scope decision is expensive to undo

**When to skip the suggestion:**
- Single-file mechanical change
- Bug fix with a clear root cause already identified
- A spike or throwaway prototype

The user can always run `/grill-me` themselves; the nudge just makes it
discoverable at the right moment.

The CE brainstorm workflow writes its own artifact to `docs/brainstorms/`. If
you ran `office-hours` instead and no file was produced, write the brainstorm
output to `docs/plans/YYYY-MM-DD-<topic>-design.md` with this frontmatter:
```
---
date: YYYY-MM-DD
producer: soloship-brainstorm
version: 1
ttl_days: 14
---
```

## Verification

The brainstorm is not complete until ALL of these are true:

- [ ] Question type identified (demand vs feature) and routed correctly
- [ ] Brainstorm output exists on disk (CE writes to `docs/brainstorms/`;
      office-hours runs write to `docs/plans/YYYY-MM-DD-<topic>-design.md`)
- [ ] Design-first nudge presented (not skipped, not buried)

---

## Feature exploration methodology (from CE brainstorm)


<!-- Vendored from compound-engineering v2.34.0 (Kieran Klaassen). See skills/vendored/ce/LICENSE. -->

# Brainstorm a Feature or Improvement

**Note: The current year is 2026.** Use this when dating brainstorm documents.

Brainstorming helps answer **WHAT** to build through collaborative dialogue. It precedes `/soloship:plan`, which answers **HOW** to build it.

**Process knowledge:** Load the `brainstorming` skill for detailed question techniques, approach exploration patterns, and YAGNI principles.

## Feature Description

<feature_description> #$ARGUMENTS </feature_description>

**If the feature description above is empty, ask the user:** "What would you like to explore? Please describe the feature, problem, or improvement you're thinking about."

Do not proceed until you have a feature description from the user.

## Execution Flow

### Phase 0: Assess Requirements Clarity

Evaluate whether brainstorming is needed based on the feature description.

**Clear requirements indicators:**
- Specific acceptance criteria provided
- Referenced existing patterns to follow
- Described exact expected behavior
- Constrained, well-defined scope

**If requirements are already clear:**
Use **AskUserQuestion tool** to suggest: "Your requirements seem detailed enough to proceed directly to planning. Should I run `/soloship:plan` instead, or would you like to explore the idea further?"

### Phase 1: Understand the Idea

#### 1.1 Repository Research (Lightweight)

Run a quick repo scan to understand existing patterns:

- Dispatch a general-purpose subagent with the prompt in `references/agents/repo-research-analyst.md`, input: "Understand existing patterns related to: <feature_description>"

Focus on: similar features, established patterns, CLAUDE.md guidance.

#### 1.2 Collaborative Dialogue

Use the **AskUserQuestion tool** to ask questions **one at a time**.

**Guidelines (see `brainstorming` skill for detailed techniques):**
- Prefer multiple choice when natural options exist
- Start broad (purpose, users) then narrow (constraints, edge cases)
- Validate assumptions explicitly
- Ask about success criteria

**Exit condition:** Continue until the idea is clear OR user says "proceed"

### Phase 2: Explore Approaches

Propose **2-3 concrete approaches** based on research and conversation.

For each approach, provide:
- Brief description (2-3 sentences)
- Pros and cons
- When it's best suited

Lead with your recommendation and explain why. Apply YAGNI—prefer simpler solutions.

Use **AskUserQuestion tool** to ask which approach the user prefers.

### Phase 3: Capture the Design

Write a brainstorm document to `docs/brainstorms/YYYY-MM-DD-<topic>-brainstorm.md`.

**Document structure:** See the `brainstorming` skill for the template format. Key sections: What We're Building, Why This Approach, Key Decisions, Open Questions.

Ensure `docs/brainstorms/` directory exists before writing.

**IMPORTANT:** Before proceeding to Phase 4, check if there are any Open Questions listed in the brainstorm document. If there are open questions, YOU MUST ask the user about each one using AskUserQuestion before offering to proceed to planning. Move resolved questions to a "Resolved Questions" section.

### Phase 4: Handoff

Use **AskUserQuestion tool** to present next steps:

**Question:** "Brainstorm captured. What would you like to do next?"

**Options:**
1. **Review and refine** - Improve the document through structured self-review
2. **Proceed to planning** - Run `/soloship:plan` (will auto-detect this brainstorm)
3. **Ask more questions** - I have more questions to clarify before moving on
4. **Done for now** - Return later

**If user selects "Ask more questions":** YOU (Claude) return to Phase 1.2 (Collaborative Dialogue) and continue asking the USER questions one at a time to further refine the design. The user wants YOU to probe deeper - ask about edge cases, constraints, preferences, or areas not yet explored. Continue until the user is satisfied, then return to Phase 4.

**If user selects "Review and refine":**

Load the `document-review` skill and apply it to the brainstorm document.

When document-review returns "Review complete", present next steps:

1. **Move to planning** - Continue to `/soloship:plan` with this document
2. **Done for now** - Brainstorming complete. To start planning later: `/soloship:plan [document-path]`

## Output Summary

When complete, display:

```
Brainstorm complete!

Document: docs/brainstorms/YYYY-MM-DD-<topic>-brainstorm.md

Key decisions:
- [Decision 1]
- [Decision 2]

Next: Run `/soloship:plan` when ready to implement.
```

## Important Guidelines

- **Stay focused on WHAT, not HOW** - Implementation details belong in the plan
- **Ask one question at a time** - Don't overwhelm
- **Apply YAGNI** - Prefer simpler approaches
- **Keep outputs concise** - 200-300 words per section max

NEVER CODE! Just explore and document decisions.

---

## Brainstorming process (from CE brainstorming)


<!-- Vendored from compound-engineering v2.34.0 (Kieran Klaassen). See skills/vendored/ce/LICENSE. -->

# Brainstorming

This skill provides detailed process knowledge for effective brainstorming sessions that clarify **WHAT** to build before diving into **HOW** to build it.

## When to Use This Skill

Brainstorming is valuable when:
- Requirements are unclear or ambiguous
- Multiple approaches could solve the problem
- Trade-offs need to be explored with the user
- The user hasn't fully articulated what they want
- The feature scope needs refinement

Brainstorming can be skipped when:
- Requirements are explicit and detailed
- The user knows exactly what they want
- The task is a straightforward bug fix or well-defined change

## Core Process

### Phase 0: Assess Requirement Clarity

Before diving into questions, assess whether brainstorming is needed.

**Signals that requirements are clear:**
- User provided specific acceptance criteria
- User referenced existing patterns to follow
- User described exact behavior expected
- Scope is constrained and well-defined

**Signals that brainstorming is needed:**
- User used vague terms ("make it better", "add something like")
- Multiple reasonable interpretations exist
- Trade-offs haven't been discussed
- User seems unsure about the approach

If requirements are clear, suggest: "Your requirements seem clear. Consider proceeding directly to planning or implementation."

### Phase 1: Understand the Idea

Ask questions **one at a time** to understand the user's intent. Avoid overwhelming with multiple questions.

**Question Techniques:**

1. **Prefer multiple choice when natural options exist**
   - Good: "Should the notification be: (a) email only, (b) in-app only, or (c) both?"
   - Avoid: "How should users be notified?"

2. **Start broad, then narrow**
   - First: What is the core purpose?
   - Then: Who are the users?
   - Finally: What constraints exist?

3. **Validate assumptions explicitly**
   - "I'm assuming users will be logged in. Is that correct?"

4. **Ask about success criteria early**
   - "How will you know this feature is working well?"

**Key Topics to Explore:**

| Topic | Example Questions |
|-------|-------------------|
| Purpose | What problem does this solve? What's the motivation? |
| Users | Who uses this? What's their context? |
| Constraints | Any technical limitations? Timeline? Dependencies? |
| Success | How will you measure success? What's the happy path? |
| Edge Cases | What shouldn't happen? Any error states to consider? |
| Existing Patterns | Are there similar features in the codebase to follow? |

**Exit Condition:** Continue until the idea is clear OR user says "proceed" or "let's move on"

### Phase 2: Explore Approaches

After understanding the idea, propose 2-3 concrete approaches.

**Structure for Each Approach:**

```markdown
### Approach A: [Name]

[2-3 sentence description]

**Pros:**
- [Benefit 1]
- [Benefit 2]

**Cons:**
- [Drawback 1]
- [Drawback 2]

**Best when:** [Circumstances where this approach shines]
```

**Guidelines:**
- Lead with a recommendation and explain why
- Be honest about trade-offs
- Consider YAGNI—simpler is usually better
- Reference codebase patterns when relevant

### Phase 3: Capture the Design

Summarize key decisions in a structured format.

**Design Doc Structure:**

```markdown
date: YYYY-MM-DD
topic: <kebab-case-topic>

# <Topic Title>

## What We're Building
[Concise description—1-2 paragraphs max]

## Why This Approach
[Brief explanation of approaches considered and why this one was chosen]

## Key Decisions
- [Decision 1]: [Rationale]
- [Decision 2]: [Rationale]

## Open Questions
- [Any unresolved questions for the planning phase]

## Next Steps
→ `/soloship:plan` for implementation details
```

**Output Location:** `docs/brainstorms/YYYY-MM-DD-<topic>-brainstorm.md`

### Phase 4: Handoff

Present clear options for what to do next:

1. **Proceed to planning** → Run `/soloship:plan`
2. **Refine further** → Continue exploring the design
3. **Done for now** → User will return later

## YAGNI Principles

During brainstorming, actively resist complexity:

- **Don't design for hypothetical future requirements**
- **Choose the simplest approach that solves the stated problem**
- **Prefer boring, proven patterns over clever solutions**
- **Ask "Do we really need this?" when complexity emerges**
- **Defer decisions that don't need to be made now**

## Incremental Validation

Keep sections short—200-300 words maximum. After each section of output, pause to validate understanding:

- "Does this match what you had in mind?"
- "Any adjustments before we continue?"
- "Is this the direction you want to go?"

This prevents wasted effort on misaligned designs.

## Anti-Patterns to Avoid

| Anti-Pattern | Better Approach |
|--------------|-----------------|
| Asking 5 questions at once | Ask one at a time |
| Jumping to implementation details | Stay focused on WHAT, not HOW |
| Proposing overly complex solutions | Start simple, add complexity only if needed |
| Ignoring existing codebase patterns | Research what exists first |
| Making assumptions without validating | State assumptions explicitly and confirm |
| Creating lengthy design documents | Keep it concise—details go in the plan |

## Integration with Planning

Brainstorming answers **WHAT** to build:
- Requirements and acceptance criteria
- Chosen approach and rationale
- Key decisions and trade-offs

Planning answers **HOW** to build it:
- Implementation steps and file changes
- Technical details and code patterns
- Testing strategy and verification

When brainstorm output exists, `/soloship:plan` should detect it and use it as input, skipping its own idea refinement phase.

---

## Brainstorming discipline (from Superpowers)


<!-- Vendored from superpowers v4.1.1 (Jesse Vincent). See skills/vendored/superpowers/LICENSE. -->

# Brainstorming Ideas Into Designs

## Overview

Help turn ideas into fully formed designs and specs through natural collaborative dialogue.

Start by understanding the current project context, then ask questions one at a time to refine the idea. Once you understand what you're building, present the design in small sections (200-300 words), checking after each section whether it looks right so far.

## The Process

**Understanding the idea:**
- Check out the current project state first (files, docs, recent commits)
- Ask questions one at a time to refine the idea
- Prefer multiple choice questions when possible, but open-ended is fine too
- Only one question per message - if a topic needs more exploration, break it into multiple questions
- Focus on understanding: purpose, constraints, success criteria

**Exploring approaches:**
- Propose 2-3 different approaches with trade-offs
- Present options conversationally with your recommendation and reasoning
- Lead with your recommended option and explain why

**Presenting the design:**
- Once you believe you understand what you're building, present the design
- Break it into sections of 200-300 words
- Ask after each section whether it looks right so far
- Cover: architecture, components, data flow, error handling, testing
- Be ready to go back and clarify if something doesn't make sense

## After the Design

**Documentation:**
- Write the validated design to `docs/plans/YYYY-MM-DD-<topic>-design.md`
- Use elements-of-style:writing-clearly-and-concisely skill if available
- Commit the design document to git

**Implementation (if continuing):**
- Ask: "Ready to set up for implementation?"
- Use using-git-worktrees to create isolated workspace
- Use writing-plans to create detailed implementation plan

## Key Principles

- **One question at a time** - Don't overwhelm with multiple questions
- **Multiple choice preferred** - Easier to answer than open-ended when possible
- **YAGNI ruthlessly** - Remove unnecessary features from all designs
- **Explore alternatives** - Always propose 2-3 approaches before settling
- **Incremental validation** - Present design in sections, validate each
- **Be flexible** - Go back and clarify when something doesn't make sense
