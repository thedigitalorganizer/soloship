---
name: debug
description: |
  Systematic debugging with root cause discipline. Routes to systematic-debugging.
  Iron law: no fixes without root cause investigation.
---

# Soloship Debug

Your job is to find and fix bugs through systematic investigation, not guessing.

## The Iron Law

**No fixes without root cause investigation.** Do not propose a fix until you
understand WHY the bug exists. "It works if I change this" is not a root cause.

## Route

Invoke `superpowers:systematic-debugging`. It enforces a 4-phase process:

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

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "I think I see the fix already" | Seeing a potential fix is not the same as understanding the root cause. The obvious fix often masks the real bug and introduces a new one. |
| "The error message tells me exactly what's wrong" | Error messages describe symptoms, not causes. A `NullPointerException` tells you what happened, not why the value was null. |
| "Let me just try this real quick" | "Quick tries" compound. Three failed guesses waste more time than one systematic investigation. |
| "This is a simple bug, I don't need a process" | Simple-looking bugs that were easy to find wouldn't have required calling `/debug`. If you're here, it's not simple. |
| "I already searched solutions, nothing matched" | Search for symptoms AND component names AND error codes. Prior art often uses different words for the same problem. |

---

## After Fixing

If the fix was non-obvious (took more than 15 minutes to diagnose, or the root
cause was surprising), suggest:

> "This fix was non-obvious. Run `/learn` to capture it as a solution doc so
> future sessions don't have to re-investigate."

## Verification

The debug is not complete until ALL of these are true:

- [ ] Root cause identified and stated in plain language (not just "changed X to Y")
- [ ] Bug is reproducible before fix (you demonstrated the failure)
- [ ] Fix applied and bug no longer reproduces
- [ ] Tests pass (existing tests still green, regression test added if applicable)
- [ ] `docs/solutions/` searched before investigation began
