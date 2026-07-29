# Browser Tooling Priority + Session Cleanup (Auto-Loaded)

## The Priority Order

Whenever a task needs a browser — QA, testing, dogfooding, verifying a deploy,
driving a user flow — pick the surface in THIS order, not whatever happens to be
loaded first:

1. **`/soloship:browse`** (Soloship's headless browser daemon) — the DEFAULT for
   all browser work. Fast (~100ms/command), persistent (cookies and logins
   survive between calls and between sessions), and never contended — it does
   not lock anything another session needs.
2. **Chrome DevTools MCP** (`mcp__chrome-devtools__*` — Google's official
   Chrome MCP) — when `/soloship:browse` can't handle the flow or you need a
   real visible Chrome. It LAUNCHES ITS OWN managed Chrome — the separate
   automation-banner window that opens as a second app — fully isolated from
   the user's everyday browser, which is exactly why it outranks the surfaces
   below: exhaust it before ever touching the browser the user lives in. It
   has no access to the user's logins or the 1Password flow; for authenticated
   flows that need those, escalate to tier 3.
3. **Claude in Chrome** (`mcp__claude-in-chrome__*` — the Claude extension
   running inside the user's OWN everyday Chrome) — when the flow needs the
   user's existing logged-in sessions, or when a login is required and the
   1Password credential flow is available (see below). You are acting inside
   the browser the user actually lives in: open your own tabs, touch nothing
   you didn't open, and clean up when done. These tools are often DEFERRED:
   absent from your visible tool list until loaded via ToolSearch. Not seeing
   them listed does not mean they are unavailable — search before concluding
   anything.
4. **The host app's built-in browser** (e.g. Claude Desktop's
   `mcp__Claude_Browser__*`) — last resort when none of the above exists on
   this machine.

Before ever reporting "no browser available" or "can't test this," you must have
actually enumerated the surfaces — including a ToolSearch for deferred browser
tools — and tried them in this order. "The browser I tried first didn't work"
is the start of the checklist, not the end of the task.

## Credentials Are Never A Dead End

"Sorry, I can't fill in the password" is a rule violation when a sanctioned path
exists. When a flow needs a login, escalate through these before declaring the
authenticated path blocked:

1. **Documented test account** (`docs/testing/test-accounts.md` per
   browser-qa-gate) via `/soloship:browse` — non-production credentials from the
   gitignored secrets file are yours to use for QA.
2. **1Password credential flow via Claude in Chrome** — `request_credentials` (name
   everything the task needs up front) → `autofill_credential` →
   `enter_verification_code` for 2FA. The user approves each item in
   1Password's own prompt and the secret goes straight into the page; you never
   see it. This flow exists precisely so you can complete authenticated QA —
   USING it is the safe behavior, refusing it is the failure.
3. **Ask the user to log in once** — in the browse daemon (headed) or their real
   Chrome; both persist the session so every later QA run sails through.

Only after offering these may you report an authenticated flow as blocked — and
per browser-qa-gate, that is an unmet gate, not "done."

## "Another Session Is Using The Browser" Is Not A Dead End

Browser MCP claims are recorded at
`<git-common-dir>/soloship/browser/<session>.json` (written by a Soloship hook
on every browser MCP call; the file's mtime is the holder's heartbeat). When a
browser surface reports busy/locked:

1. Read the claim files. A claim whose mtime is older than
   `browser_claim_stale_min` (in `<git-common-dir>/soloship/config.json`) is a
   dead session's leftovers — the browser is actually free. Proceed: open your
   own fresh tab rather than touching tabs you did not create.
2. A FRESH claim means a live session really is driving that browser — fall to
   the next surface in the priority order instead of waiting or giving up.
3. Never report "browser unavailable" without stating which surfaces you tried
   and what each one said.

## Cleanup When Browser Work Is Done

The moment QA passes (before reporting done/finish/merge/ship — the same
boundary as browser-qa-gate):

- **Close every Claude in Chrome tab you created** (`tabs_close_mcp`) and release
  credential grants (`release_credentials`) if you requested any. Tabs in the
  user's own Chrome can only be closed by the session that made them — no hook
  can do it for you later.
- **Close any Chrome DevTools MCP pages and built-in-browser pages you
  opened** (the managed automation Chrome window should not linger after QA).
- **Leave the `/soloship:browse` daemon running.** Its persistence (logins,
  cookies) is shared state by design; killing it (`browse disconnect`) punishes
  every other session. Only disconnect when a config change requires it.
- Your claim file is released mechanically (SessionEnd hook) and expires by
  staleness even if the session dies — but the tabs are on you.

## Why

QA is the gate every piece of work waits on. Two failure modes kept ending QA
runs falsely: an agent defaulting to a browser surface that cannot complete an
authenticated flow and giving up ("you'll have to fill the password yourself"),
and an agent believing a browser was busy because a session that died yesterday
never released it. Both are protocol failures, not real blockers. Stated by the
maintainer on 2026-07-29 after repeated occurrences.

## When This Triggers

- Any time browser work starts (QA, dogfooding, deploy verification, scraping).
- Any time an agent is about to claim a login, a busy browser, or a missing
  browser makes testing impossible.
- Any time QA finishes — the cleanup section is part of the done-definition.
