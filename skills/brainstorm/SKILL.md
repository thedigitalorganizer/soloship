---
name: brainstorm
description: |
  Explore what you're building and why before planning. Routes to office-hours
  for pure product/demand questions or compound-engineering:workflows:brainstorm
  for feature and approach exploration. Ends with a nudge to design visually
  before running /plan.
---

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
Invoke the `office-hours` skill. It uses 6 forcing questions that expose demand
reality, status quo, and the narrowest wedge. Use this only when the *existence*
of the feature is in question.

**For feature questions:**
Invoke the `compound-engineering:workflows:brainstorm` skill. It runs a full
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
