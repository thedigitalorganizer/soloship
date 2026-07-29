# QA Plan In Every Plan — Method Matched To Work Type (Auto-Loaded)

## The Rule

**Every implementation plan must contain a `## QA Plan` section** — a table of
every surface the work touches, the verification method **matched to the type of
work**, and the evidence that will be captured. How the work will be verified is
a planning decision, not an afterthought at ship time.

Automated tests are **necessary but never sufficient** — a green suite proves the
units pass, not that the real surface behaves. Every plan names at least one
*observed, end-to-end* verification of the real surface. "Run the test suite"
alone never passes as a QA Plan.

## Format

```markdown
## QA Plan

| Surface touched | How it will be verified | Evidence |
|---|---|---|
| /settings page (UI) | browser QA: change a setting, reload, verify persistence; exercise the validation-error state | screenshots |
| POST /api/settings | real requests: happy path + 401 + invalid payload | response bodies |
```

One row per touched surface — a UI + API + migration change needs three rows.

Two standing requirements on the rows:

- **Authenticated rows name their account.** Any row exercising a
  login-gated flow states which documented test account it runs as (per the
  browser-qa-gate test-account standard, `docs/testing/test-accounts.md`).
  A row that sends email states that verification includes opening the QA
  inbox and seeing the email.
- **Executing a QA Plan always ends with browser teardown** (per
  `browser-tooling-priority`): close the tabs/pages the session opened,
  release credential grants, release the browser claim. Teardown is part of
  executing the plan, not an optional courtesy — a QA run that leaves the
  browser held has not finished its QA Plan.

## Choosing the method — match it to the work type

| Work type / surface | Primary verification (in addition to automated tests) |
|---|---|
| Web UI / user-facing flow | **Browser QA** (headless browser / browser MCP) — drive each affected flow end-to-end, including empty/error/loading/validation states; capture screenshots. The default whenever *anything* renders in a browser. |
| API endpoint / webhook / server route | Real requests against the running service — happy path + auth failure + validation error; capture actual responses. |
| CLI / installer / script | Run the real commands end-to-end in a clean scratch directory; capture output and exit codes; verify produced artifacts. |
| Data migration / backfill | Pre/post row counts, spot-check queries, idempotency check (safe to run twice), rollback path stated. |
| Cron / background job / queue consumer | Trigger the job once manually; observe logs and the produced side effect. |
| Config / infra / deploy pipeline | Deploy to preview/staging; verify the behavior the config controls actually changed. |
| Pure logic / library / refactor | Unit/property tests PLUS one consumer-level smoke through a real caller. Tests alone only when no runtime surface exists. |
| Skill / prompt / agent-governance change | Dry-run the skill or hook in a real session on a sample task; confirm the new behavior appears. |
| Docs-only | Read the rendered output; verify referenced paths/links exist. |

Browser QA is the default whenever any browser-reachable surface exists — it most
often makes the most sense. But a change with no browser surface must pick the
matching row, never skip QA.

## The fix-and-re-verify loop (every row, until perfect)

Executing the QA Plan is a loop, not a checklist pass. If ANY row surfaces ANY
issue — wrong behavior, failing request, wrong CLI output, bad migration result,
regression on an adjacent surface:

1. Fix it.
2. **Re-execute that row** and observe the fix actually working (re-drive the
   flow / re-send the request / re-run the command / re-check the data). A fix
   is done when the re-run shows correct behavior, not when the code changed.
3. **Re-check adjacent rows the fix could have touched.**
4. Repeat until **every row passes clean**. Never stop at "mostly passing,"
   never downgrade a failing row to a known issue or a follow-up task.

The loop has exactly two exits: every row passes with evidence, or a failure is
genuinely unfixable right now (external blocker, needs the user's product
decision) — then stop, report the work as **not done** with the failing row and
why, and ask the user. Never silently proceed. If the same fix keeps failing,
debug the root cause instead of re-patching, then resume the loop.

## Why This Exists

Verification used to be enforced only at execution time (the browser-qa-gate
rule). Plans could pass review with a generic "testing requirements" bullet, and
the QA method got improvised at the end — defaulting to whatever was easiest,
not whatever matched the work. Naming the method per surface at plan time makes
thorough QA the planned path instead of a rescue.

## When This Triggers

- Writing any implementation plan (any producer, not just `/soloship:plan`).
- Reviewing a plan: a plan without a QA Plan section, or whose rows don't match
  the work type, does not pass review.
- Executing a plan: the QA gate executes every row of the plan's QA Plan before
  the work may be called done. If an older plan has no QA Plan section, derive
  one from the diff and execute it.

This rule is the plan-time complement to `browser-qa-gate` (the execution-time
floor). Both apply.
