---
name: debug
description: |
  Systematic debugging with root cause discipline. Runs the 4-phase
  investigate-analyze-hypothesize-implement methodology (vendored from
  Superpowers). Iron law: no fixes without root cause investigation.
---

## Host Compatibility

If you are running this skill in Codex, read `../references/codex-compatibility.md` before following host-specific tool instructions. Claude Code should continue to use the Claude-specific tools and command wrappers described here.

# Soloship Debug

Your job is to find and fix bugs through systematic investigation, not guessing.

## Model posture (see .claude/rules/model-mode.md)

**Standard posture** (Opus/Sonnet/Codex — the default): run the methodology
exactly as written, every phase in order.

**Fable posture** (model id contains `fable`/`mythos`): the gates below are
binding; the rest is method guidance you may adapt.

**Gates (binding):** the Iron Law — no fix proposed before the root cause is
understood and stated in plain language · the Before-Starting
`docs/solutions/` search · demonstrated reproduction BEFORE the fix and a
re-run showing the bug gone AFTER (Phase 4's failing-test-then-verify; an
automated regression test where a framework exists) · existing tests still
green · the 3-failed-fixes stop — question the architecture WITH the user
before attempting a fourth · the After-Fixing `/learn` suggestion for
non-obvious fixes · every Verification checklist box.

**Choreography (adaptable in Fable posture):** the strict Phase 1→4
sequencing, the one-hypothesis-at-a-time and one-variable-at-a-time pacing,
the per-phase sub-checklists, and the Quick Reference format. Investigate in
whatever order the evidence pulls you — but the outcomes those steps protect
never move: understanding first, reproduction first, fix second,
verification observed. Renaming a guess an investigation is the misread this
skill exists to stop, in either posture.

## The Iron Law

**No fixes without root cause investigation.** Do not propose a fix until you
understand why the bug exists. "It works if I change this" is not a root cause.

## Methodology overview

Apply the full 4-phase methodology below (Phase 1 through Phase 4):

1. **Investigate** — reproduce the bug, gather evidence
2. **Analyze** — form hypotheses about root cause
3. **Hypothesize** — test hypotheses with targeted experiments
4. **Implement** — fix based on confirmed root cause

## Before Starting

Search `docs/solutions/` for prior art. Grep for:
- The error message
- The component/file name
- The symptom description

If a matching solution doc exists, read it first. The fix may already be documented.
**Freshness check:** If the solution doc has frontmatter with `date` and `ttl_days`,
and today exceeds date + ttl_days, note: "This solution doc is N days old — the
codebase may have changed since it was written. Verify the fix still applies."

## Common misreads

- "I think I see the fix already" → seeing a potential fix is not the same as understanding the root cause. The obvious fix often masks the real bug and introduces a new one.
- "The error message tells me exactly what's wrong" → error messages describe symptoms, not causes. A `NullPointerException` tells you what happened, not why the value was null.
- "Let me just try this real quick" → "quick tries" compound. Three failed guesses waste more time than one systematic investigation.
- "This is a simple bug, I don't need a process" → simple-looking bugs that were easy to find wouldn't have required calling `/debug`. If you're here, it's not simple.
- "I already searched solutions, nothing matched" → search for symptoms and component names and error codes. Prior art often uses different words for the same problem.

---

## After Fixing

If the fix was non-obvious (took more than 15 minutes to diagnose, or the root
cause was surprising), suggest:

> "This fix was non-obvious. Run `/learn` to capture it as a solution doc so
> future sessions don't have to re-investigate."

## Verification

The debug is not complete until all of these are true:

- [ ] Root cause identified and stated in plain language (not just "changed X to Y")
- [ ] Bug is reproducible before fix (you demonstrated the failure)
- [ ] Fix applied and bug no longer reproduces
- [ ] Tests pass (existing tests still green, regression test added if applicable)
- [ ] `docs/solutions/` searched before investigation began

---

## Systematic Debugging Methodology


<!-- Vendored from superpowers v6.0.3 (Jesse Vincent). See skills/vendored/superpowers/LICENSE. Tone softened for Claude 5 (2026-07-28): register calmed, gate semantics unchanged; deliberately diverges from upstream wording (see Superpowers issue #1878). Soloship keeps its scrubbed sibling-skill refs (test-driven-development, verification-before-completion — upstream still namespaces these `superpowers:`). Sidecar references (root-cause-tracing.md, defense-in-depth.md, condition-based-waiting.md + .ts example) now vendored alongside, fixing previously-dangling links. -->

# Systematic Debugging

## Overview

Random fixes waste time and create new bugs. Quick patches mask underlying issues.

**Core principle:** always find the root cause before attempting fixes. A symptom fix is not a fix.

The process applies in spirit, not just letter — renaming a guess does not make it an investigation.

## The Iron Law

**The rule: no fixes without root cause investigation first.**

If you haven't completed Phase 1, you cannot propose fixes.

## When to Use

Use for any technical issue:
- Test failures
- Bugs in production
- Unexpected behavior
- Performance problems
- Build failures
- Integration issues

**Use this especially when:**
- Under time pressure (emergencies make guessing tempting)
- "Just one quick fix" seems obvious
- You've already tried multiple fixes
- Previous fix didn't work
- You don't fully understand the issue

**Don't skip when:**
- Issue seems simple (simple bugs have root causes too)
- You're in a hurry (rushing guarantees rework)
- Manager wants it fixed now (systematic is faster than thrashing)

## The Four Phases

Complete each phase before proceeding to the next.

### Phase 1: Root Cause Investigation

**Before attempting any fix:**

1. **Read Error Messages Carefully**
   - Don't skip past errors or warnings
   - They often contain the exact solution
   - Read stack traces completely
   - Note line numbers, file paths, error codes

2. **Reproduce Consistently**
   - Can you trigger it reliably?
   - What are the exact steps?
   - Does it happen every time?
   - If not reproducible → gather more data, don't guess

3. **Check Recent Changes**
   - What changed that could cause this?
   - Git diff, recent commits
   - New dependencies, config changes
   - Environmental differences

4. **Gather Evidence in Multi-Component Systems**

   **When the system has multiple components (CI → build → signing, API → service → database):**

   **Before proposing fixes, add diagnostic instrumentation:**
   ```
   For each component boundary:
     - Log what data enters component
     - Log what data exits component
     - Verify environment/config propagation
     - Check state at each layer

   Run once to gather evidence showing where it breaks
   Then analyze evidence to identify failing component
   Then investigate that specific component
   ```

   **Example (multi-layer system):**
   ```bash
   # Layer 1: Workflow
   echo "=== Secrets available in workflow: ==="
   echo "IDENTITY: ${IDENTITY:+SET}${IDENTITY:-UNSET}"

   # Layer 2: Build script
   echo "=== Env vars in build script: ==="
   env | grep IDENTITY || echo "IDENTITY not in environment"

   # Layer 3: Signing script
   echo "=== Keychain state: ==="
   security list-keychains
   security find-identity -v

   # Layer 4: Actual signing
   codesign --sign "$IDENTITY" --verbose=4 "$APP"
   ```

   **This reveals:** Which layer fails (secrets → workflow ✓, workflow → build ✗)

5. **Trace Data Flow**

   **When the error is deep in the call stack:**

   See `root-cause-tracing.md` in this directory for the complete backward tracing technique.

   **Quick version:**
   - Where does bad value originate?
   - What called this with bad value?
   - Keep tracing up until you find the source
   - Fix at source, not at symptom

### Phase 2: Pattern Analysis

**Find the pattern before fixing:**

1. **Find Working Examples**
   - Locate similar working code in same codebase
   - What works that's similar to what's broken?

2. **Compare Against References**
   - If implementing pattern, read reference implementation completely
   - Don't skim - read every line
   - Understand the pattern fully before applying

3. **Identify Differences**
   - What's different between working and broken?
   - List every difference, however small
   - Don't assume "that can't matter"

4. **Understand Dependencies**
   - What other components does this need?
   - What settings, config, environment?
   - What assumptions does it make?

### Phase 3: Hypothesis and Testing

**Scientific method:**

1. **Form Single Hypothesis**
   - State clearly: "I think X is the root cause because Y"
   - Write it down
   - Be specific, not vague

2. **Test Minimally**
   - Make the smallest possible change to test hypothesis
   - One variable at a time
   - Don't fix multiple things at once

3. **Verify Before Continuing**
   - Did it work? Yes → Phase 4
   - Didn't work? Form a new hypothesis
   - Don't add more fixes on top

4. **When You Don't Know**
   - Say "I don't understand X"
   - Don't pretend to know
   - Ask for help
   - Research more

### Phase 4: Implementation

**Fix the root cause, not the symptom:**

1. **Create Failing Test Case**
   - Simplest possible reproduction
   - Automated test if possible
   - One-off test script if no framework
   - Required before fixing
   - Use the `test-driven-development` skill for writing proper failing tests

2. **Implement Single Fix**
   - Address the root cause identified
   - One change at a time
   - No "while I'm here" improvements
   - No bundled refactoring

3. **Verify Fix**
   - Test passes now?
   - No other tests broken?
   - Issue actually resolved?

4. **If Fix Doesn't Work**
   - Stop
   - Count: How many fixes have you tried?
   - If < 3: Return to Phase 1, re-analyze with new information
   - **If ≥ 3: stop and question the architecture (step 5 below)**
   - Don't attempt Fix #4 without architectural discussion

5. **If 3+ Fixes Failed: Question Architecture**

   **Pattern indicating architectural problem:**
   - Each fix reveals new shared state/coupling/problem in different place
   - Fixes require "massive refactoring" to implement
   - Each fix creates new symptoms elsewhere

   **Stop and question fundamentals:**
   - Is this pattern fundamentally sound?
   - Are we "sticking with it through sheer inertia"?
   - Should we refactor architecture vs. continue fixing symptoms?

   **Discuss with your human partner before attempting more fixes**

   This is not a failed hypothesis — it is a wrong architecture.

## Signs you're off the process

If you catch yourself thinking:
- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "Add multiple changes, run tests"
- "Skip the test, I'll manually verify"
- "It's probably X, let me fix that"
- "I don't fully understand but this might work"
- "Pattern says X but I'll adapt it differently"
- "Here are the main problems: [lists fixes without investigation]"
- Proposing solutions before tracing data flow
- **"One more fix attempt" (when already tried 2+)**
- **Each fix reveals new problem in different place**

Any of these means the same thing: stop and return to Phase 1.

**If 3+ fixes failed:** question the architecture (see Phase 4.5)

## Signals from your human partner

Watch for these redirections — each one is telling you the process was skipped:
- "Is that not happening?" - You assumed without verifying
- "Will it show us...?" - You should have added evidence gathering
- "Stop guessing" - You're proposing fixes without understanding
- "Ultrathink this" - Question fundamentals, not just symptoms
- "We're stuck?" (frustrated) - Your approach isn't working

**When you see these:** stop and return to Phase 1.

## Common misreads

- "The issue is simple, I don't need the process" → simple issues have root causes too, and the process is fast for simple bugs.
- "It's an emergency, no time for process" → systematic debugging is faster than guess-and-check thrashing.
- "I see the problem / just try this first, then investigate" → seeing symptoms is not understanding the root cause, and the first fix sets the pattern. Do it right from the start.
- "I'll write the test after confirming the fix works" → untested fixes don't stick. A failing test first proves it.
- "Multiple fixes at once saves time / the reference is too long, I'll adapt it" → you can't isolate what worked, and partial understanding guarantees bugs. One change at a time; read references completely.
- "One more fix attempt" (after 2+ failures) → 3+ failures signal an architectural problem. Question the pattern instead of fixing again.

## Quick Reference

| Phase | Key Activities | Success Criteria |
|-------|---------------|------------------|
| **1. Root Cause** | Read errors, reproduce, check changes, gather evidence | Understand what and why |
| **2. Pattern** | Find working examples, compare | Identify differences |
| **3. Hypothesis** | Form theory, test minimally | Confirmed or new hypothesis |
| **4. Implementation** | Create test, fix, verify | Bug resolved, tests pass |

## When Process Reveals "No Root Cause"

If systematic investigation reveals issue is truly environmental, timing-dependent, or external:

1. You've completed the process
2. Document what you investigated
3. Implement appropriate handling (retry, timeout, error message)
4. Add monitoring/logging for future investigation

**But:** 95% of "no root cause" cases are incomplete investigation.

## Supporting Techniques

These techniques are part of systematic debugging and available in this directory:

- **`root-cause-tracing.md`** - Trace bugs backward through call stack to find original trigger
- **`defense-in-depth.md`** - Add validation at multiple layers after finding root cause
- **`condition-based-waiting.md`** - Replace arbitrary timeouts with condition polling

**Related skills:**
- **test-driven-development** - For creating failing test case (Phase 4, Step 1)
- **verification-before-completion** - Verify fix worked before claiming success

## Real-World Impact

From debugging sessions:
- Systematic approach: 15-30 minutes to fix
- Random fixes approach: 2-3 hours of thrashing
- First-time fix rate: 95% vs 40%
- New bugs introduced: Near zero vs common
