---
name: brainstorm
description: |
  Explore what you're building and why before planning. Routes to office-hours
  for product/direction questions or brainstorming for technical approaches.
  Ends with a nudge to design visually before running /plan.
---

# Soloship Brainstorm

Your job is to help the user think through what they're building before they
plan how to build it.

## Step 1: Determine the Type of Question

Ask yourself: is this a **product** question or a **technical** question?

**Product questions** — "should we build this?", "what should this feature do?",
"who is this for?", "is this the right direction?", business model, user needs,
market fit, feature prioritization.

**Technical questions** — "how should we architect this?", "what approach should
we take?", "React or Vue?", implementation trade-offs, data modeling, API design.

## Step 2: Route

**For product questions:**
Invoke the `office-hours` skill. It uses 6 forcing questions that expose demand
reality, status quo, and the narrowest wedge. This prevents building things
nobody wants.

**For technical questions:**
Invoke the `superpowers:brainstorming` skill. It explores approaches through
incremental dialogue — one question at a time, multiple choice when possible,
presenting 2-3 approaches with trade-offs.

**If unclear:** Default to product first. It's better to confirm you're building
the right thing before deciding how to build it.

## Step 3: Design-First Nudge

After brainstorming concludes and you have clarity on WHAT to build, present
this before suggesting /plan:

> You know what you're building. Now design what it looks like before you plan
> how to build it. Use Stitch, Figma, or sketch it on paper. When you can see
> it, run `/plan`.

This is not optional. Real product teams (Apple, Google, Stripe) start with
design, not architecture. You can't plan how to build something until you can
see what you're building.

Write the brainstorm output to `docs/plans/YYYY-MM-DD-<topic>-design.md`.
Start with YAML frontmatter:
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

- [ ] Question type identified (product vs technical) and routed correctly
- [ ] Brainstorm output written to `docs/plans/YYYY-MM-DD-<topic>-design.md`
- [ ] Design-first nudge presented (not skipped, not buried)
