---
name: health
description: |
  Codebase health score. Routes to gstack health for composite 0-10 quality
  scoring with trend tracking. Wire into shipthorough as a pre-ship gate.
---

# Soloship Health

Invoke the `health` skill (gstack). It wraps whatever quality tools the project
has (type checker, linter, test runner, dead code detector) into a weighted
composite 0-10 score and tracks trends over time.

## Before Starting

Detect available tools by checking for:
- `tsconfig.json` → TypeScript (`tsc --noEmit`)
- `biome.json` / `.eslintrc*` → Linter
- `jest.config*` / `vitest.config*` / test scripts in `package.json` → Tests
- `knip.json` / knip in devDependencies → Dead code
- Shell scripts in `bin/` → ShellCheck

If the project has none of these, say so: "No quality tools detected. Run
`/bootstrap` to set up linting and testing first."

## After Health Check

Based on the score:
- **8-10:** "Healthy. Ship when ready."
- **5-7:** "Some issues. Consider fixing before shipping." List the top 3 items
  dragging the score down.
- **Below 5:** "Needs attention before new work." Suggest `/debug` for specific
  failures or `/plan` for a cleanup sprint.

If the score dropped since the last check, call out exactly what changed and
which commits introduced the regression.

## Integration with Ship Workflows

When invoked as part of `/shipthorough`, a health score below 5 is a blocking
gate. Present the score and ask: "Health score is [N]/10. Fix issues before
shipping, or override?"

## Verification

Health check is not complete until ALL of these are true:

- [ ] Available quality tools detected and listed
- [ ] Each tool ran and produced output (show pass/fail per tool)
- [ ] Composite 0-10 score computed and displayed
- [ ] Trend shown if prior scores exist ("was 7, now 8 — improving")
- [ ] Actionable next step suggested based on score
