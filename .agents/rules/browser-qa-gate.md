# Browser QA Before Done (Auto-Loaded)

## The Rule

**No work is "done," "complete," "fixed," or "shipped" until every user-facing
flow it touches has been exercised in a real browser, any issue found has been
fixed, and the fix has been re-verified by re-running the flow.** A green build
and passing tests are necessary but not sufficient — they prove the code
compiles and units pass, not that the button does the thing. Only driving the
real UI proves that.

This is `verification-before-completion` applied to the user-facing surface, and
it is a hard gate. It is satisfied by **observed evidence**, never by assertion.
"It should work," "the build is green," or "I changed the code that renders it"
do not pass this gate. Watching the real flow happen does.

## What "browser QA" means

Use `/soloship:browse` (Soloship's headless browser) against the running app
(local dev server or deployed preview). Browser selection, credential
escalation, and the busy-browser protocol are governed by the
`browser-tooling-priority` rule: `/soloship:browse` first, then Google's
Chrome DevTools MCP (its own managed Chrome), then Claude in Chrome (the
extension in the user's own Chrome, with the 1Password credential flow), then
the host app's built-in browser —
and neither a login wall nor a "browser in use by another session" report is
ever grounds to skip the gate.

1. **Identify the affected surface.** From the diff, list every page, route,
   component, and flow this change can reach. That whole list is what gets
   exercised — not just the one screen you had in mind.
2. **Exercise real flows, not page loads.** Click the happy path *and* the
   states the change introduces or affects (empty, error, loading, validation
   failure, the specific interaction). Loading a page without interacting is not
   QA.
3. **Capture evidence** — screenshots and the observed result of each flow.

## Test accounts

If a flow requires authentication or specific account state (a role, a record, a
paid plan), QA it **as a real logged-in user with a test account** — do not skip
the authenticated path.

1. **Look for documented test accounts** at `docs/testing/test-accounts.md`. If
   it exists, use the account it names as the default for QA (and read the
   credentials from the gitignored secrets file it points to). Use a different
   account only when the task specifically calls for one.
2. **If no test account is documented and a flow needs auth, stop and ask the
   user:** *"This project has no documented test account and this flow needs a
   login. Want me to create a test account and document it so QA always uses it
   from now on (unless a specific account is needed)?"*
   - **If yes:** create the account the cheapest reliable way — the app's own
     signup flow via `/soloship:browse`, or a seed/admin script if one exists.
     If the account genuinely can't be self-served (manual provisioning,
     external IdP), ask the user to provision one and hand you the credentials.
     Then **document it** in `docs/testing/test-accounts.md` per the standard
     below.
   - **From then on**, that documented default account is what QA uses unless the
     task names a specific one.
   - **If no:** the authenticated flow is untested — say so plainly and do not
     call the work done. "Couldn't test, it needs a login" is an unmet gate, not
     an exemption.

### The test-account standard (what the doc must contain)

`docs/testing/test-accounts.md` is built to a standard, not ad hoc (full
template: the Soloship skill reference `references/qa-test-accounts.md`):

1. **One account per role/permission level** the app actually has — including
   fixtures defined by an *absence* (a pending invite, an unclaimed seat).
   QA runs as the role the flow serves.
2. **Plus-alias emails routed to ONE inbox** (`qa+<role>@<domain>`, all
   aliases of a single service/QA address) so every email the app sends to any
   test account lands in one place. The doc records which inbox and how QA
   reads it — **email flows are verified by opening that inbox and seeing the
   email**, not assumed from on-screen success.
3. **A dedicated QA tenant/org/workspace** so QA never touches real customer
   data.
4. **Secrets out of the repo** — the doc lists emails/roles/purposes and the
   QA default; passwords live in a gitignored file
   (`.ai/test-credentials.json` or the project's secret store). One shared
   password across the set is fine; non-production, disposable only.
5. **Idempotent provisioning** — a re-runnable script or documented reset that
   refreshes the set without duplicating, self-heals absence fixtures back to
   pristine after QA claims them, and refuses to delete accounts holding real
   work. Keep a "Verified working: <date>" line current.

## The fix-and-re-verify loop

Any issue browser QA surfaces (visual break, broken interaction, console error,
wrong behavior, regression on an adjacent flow):

1. Fix it.
2. **Re-run the browser QA for that flow** and observe the fix actually working.
   A fix is not done because the code changed; it's done when the re-run shows
   the correct behavior.
3. Repeat until every affected flow passes clean.

Only then may the work proceed to finish/merge/ship.

## Teardown when QA passes

Passing QA ends with cleanup, not just a report: close every Claude in Chrome tab you
created, release any credential grants, close built-in-browser pages — leave the
`/soloship:browse` daemon running (shared by design). Full protocol in
`browser-tooling-priority`. A QA session that keeps holding the user's browser
after finishing is the reason the NEXT session finds it "busy."

## The only valid exemption

If the change has **no browser-reachable surface** — a pure CLI change, internal
script, config/infra-only change, or a data migration with no UI effect — state
that explicitly with the reason ("No browser QA: this only touches the build
script; nothing renders differently"), and verify the actual observable outcome
another way (run the CLI and show output, hit the endpoint and show the response,
query the data and show the row). The exemption is "there is nothing in a
browser to test," never "browser testing is inconvenient" or "I'm confident."
When in doubt, open it in the browser.

## When This Triggers

- Any time work is about to be called done/complete/fixed in `/soloship:implement`
  (its Browser QA Gate, Step 2.6).
- Before the merge in `/soloship:shipthorough` and before reporting "Shipped" in
  `/soloship:shipfast`.
- Any other point an agent is about to claim a user-facing change works.

This gate is **in addition to** the Scope Ledger Gate and the Iron Law of
verification, not a replacement.
