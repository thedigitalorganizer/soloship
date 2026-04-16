---
name: design-review
description: |
  Visual design audit combining gstack design-review checklist with Impeccable
  AI Slop Detection. Finds spacing issues, hierarchy problems, and generic
  AI-generated design fingerprints, then fixes them.
---

# Soloship Design Review

Your job is to find visual and design quality issues, then fix them.

## Step 1: Design Review Checklist

Invoke the `design-review` skill (gstack). It finds:
- Visual inconsistency
- Spacing issues
- Hierarchy problems
- Slow interactions

It iteratively fixes issues in source code, committing each fix atomically
and re-verifying with before/after screenshots.

## Step 2: AI Slop Detection

After the design review completes, run a second pass checking for AI-generated
design fingerprints. These are patterns that scream "an AI made this":

**Visual slop:**
- Generic linear gradients (especially blue-to-purple)
- Default drop shadows (shadow-lg on everything)
- Overly rounded corners (rounded-2xl/3xl on everything)
- Stock illustration style (generic blob people, isometric icons)
- Identical card heights with identical padding everywhere

**Content slop:**
- "Lorem ipsum" or clearly placeholder text left in
- "Welcome to [Product]" as a hero heading
- Generic microcopy ("Get started today!", "Unlock the power of...")
- Buzzword soup in feature descriptions
- Emoji as a substitute for actual icons

**Layout slop:**
- Three-column feature grid (the #1 AI layout cliche)
- Hero + 3 features + CTA footer (the default AI landing page)
- Everything centered, nothing left-aligned
- No visual tension or asymmetry anywhere

For each finding, fix it with a more distinctive, intentional design choice.
Commit each fix atomically.

## Step 3: Visual Verification

After fixes, take a final screenshot and compare with the initial state.
Present the before/after to the user.

**Design review uses `references/accessibility-checklist.md` for accessibility checks.**

## Verification

Design review is not complete until ALL of these are true:

- [ ] Design review checklist ran (spacing, hierarchy, consistency, interactions)
- [ ] AI slop detection pass ran (visual, content, and layout slop checked)
- [ ] Each fix committed atomically (not batched into one giant commit)
- [ ] Before/after screenshots taken and presented to user
- [ ] Final state screenshot shows no remaining Critical/High findings
