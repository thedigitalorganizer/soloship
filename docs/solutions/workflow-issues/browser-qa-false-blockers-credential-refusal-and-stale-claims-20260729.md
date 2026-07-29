---
title: Agents falsely block browser QA — refusing available credential paths and trusting stale busy-browser claims
date: 2026-07-29
producer: soloship-learn
version: 1
ttl_days: 90
content_hash: da4219063933
problem_type: integration_issue
category: workflow-issues
components: [browser-qa, soloship-rules, soloship-hooks, skills/qa, skills/implement, skills/plan, skills/browse, skills/shipfast, skills/shipthorough, skills/finish]
files: [src/rules.ts, src/hooks.ts, src/templates.ts, __arch__/fitness.test.ts, skills/qa/SKILL.md, skills/implement/SKILL.md, skills/plan/SKILL.md, skills/browse/SKILL.md, skills/shipfast/SKILL.md, skills/shipthorough/SKILL.md, skills/finish/SKILL.md, skills/references/qa-test-accounts.md, CHANGELOG.md, package.json, .claude-plugin/plugin.json, .claude-plugin/marketplace.json, .codex-plugin/plugin.json]
symptoms: ["agent refuses authenticated browser QA with a variant of 'I can't fill in the password', never trying the 1Password autofill flow that was already available", "agent reports 'another session is using the browser' for a browser session that actually died hours or days earlier", "two architecturally different Chrome-automation MCP surfaces get conflated in agent reasoning (the user's real browser vs. an isolated managed instance)", "authenticated QA silently skipped or faked because no test account is documented"]
root_cause: missing_workflow_step
resolution_type: workflow_improvement
error_messages: []
tags: [browser-tooling-priority, claude-in-chrome, chrome-devtools-mcp, credential-escalation, 1password-autofill, session-claim-staleness, browser-teardown, stop-hook, session-end-hook, test-account-standard, qa-gate, soloship-governance, collapse-zone]
---

# Agents falsely block browser QA — refusing available credential paths and trusting stale busy-browser claims

## Symptoms

Across a ~14-project Soloship-governed workspace, agents doing browser QA kept
producing two false "can't do this" reports even though the work was possible:

1. An agent would hit a login wall during QA and stop with "sorry, I can't fill
   in the password" — without ever trying or offering the 1Password credential
   flow (`request_credentials` → `autofill_credential` →
   `enter_verification_code`) that was already available via the Claude in
   Chrome MCP extension.
2. An agent would try to drive a browser MCP surface and report "another
   session is using the browser" — when the session that supposedly held it
   had actually crashed, been `/clear`'d, or exited normally hours or days
   before. Nothing had ever released or expired that belief.

A third, compounding gap: some QA flows need authentication and no project had
a documented standard for what a test account should look like, so agents
either skipped the authenticated path or improvised something ad hoc each
time.

## Root cause

**Missing workflow step, not a code bug.** Three gaps in the governance layer,
none of them a defect in any single line of code:

1. **No stated priority order for browser surfaces**, so agents defaulted to
   whichever tool loaded first — often one with no login access at all — and
   had no rule telling them a credential-capable surface existed and should be
   tried before giving up.
2. **No mechanical signal for "is this browser claim still alive."** Session
   liveness was never tracked for browser MCP tools, so there was no way to
   tell "actively in use right now" from "used yesterday, never released."
   Agents had no data to distinguish these and defaulted to treating any
   report of contention as a hard stop.
3. **No standard for `docs/testing/test-accounts.md`**, so the credential
   escalation path in the existing `browser-qa-gate` rule had nothing concrete
   to point to.

A fourth wrinkle surfaced during the fix itself, not before it: two different
browser-automation MCP surfaces — Google's Chrome DevTools MCP (which launches
its own separate, fully isolated managed Chrome with an automation banner) and
Claude in Chrome (the extension inside the user's actual everyday Chrome) —
look similar enough ("a Chrome window with automation attached") that the
first draft of the fix conflated them under one label. The maintainer caught
this from direct observation (a second application window opening that
clearly wasn't his day-to-day browser) rather than from reading any rule text.

## Solution

Two governance layers, both shipped in `soloship@0.20.0` so every project
inherits them on `soloship upgrade`.

**1. Browser-tooling priority rule** (`browser-tooling-priority.md`, installed
into every project's `.claude/rules/` and `.codex/rules/`). Replaces "whatever
browser surface loaded first" with a strict, ranked order:

1. `/soloship:browse` — Soloship's headless daemon (persistent cookies/logins,
   never contended)
2. Chrome DevTools MCP (`mcp__chrome-devtools__*`) — Google's official MCP; it
   launches its own isolated managed Chrome (the automation-banner window), no
   access to the user's logins
3. Claude in Chrome (`mcp__claude-in-chrome__*`) — the extension inside the
   user's actual everyday Chrome; the only surface with 1Password autofill
4. host app's built-in browser — last resort

Paired with an explicit credential-escalation contract: "I can't fill in the
password" is now a named rule violation unless the agent escalated through
documented test account → 1Password flow via Claude in Chrome → asking the
user to log in once (which then persists for future sessions).

**2. Mechanical claim/release system for browser sessions**, generated by
`src/hooks.ts` into every project's `.claude/settings.local.json`:

- **`PostToolUse`** hook (matcher:
  `mcp__claude-in-chrome__.*|mcp__chrome-devtools__.*|mcp__Claude_Browser__.*`)
  stamps/refreshes `<git-common-dir>/soloship/browser/<session-id>.json` on
  every browser MCP call. File mtime = heartbeat; the `claimed` timestamp
  inside is preserved across refreshes.
- **`SessionEnd`** hook — a new hook event added to Soloship's `HOOK_EVENTS`
  list and settings-merge machinery — deletes the session's claim file when
  the session actually ends.
- Claims older than `BROWSER_CLAIM_STALE_MIN` (60 min, deliberately reusing
  the existing `SESSION_IDLE_MIN` constant rather than inventing a new
  threshold — see Related, below) are documented as presumed-dead: the next
  agent reads the file's age and proceeds if stale, or falls to the next
  priority-order surface if fresh.
- **`Stop`** hook (`buildBrowserTeardownReminderScript`) — fires on every
  assistant reply-end. If the current session's own claim file exists and has
  gone quiet for `BROWSER_TEARDOWN_REMIND_MIN` (10 min) while the session is
  still running, it emits a `systemMessage` naming the held surface and the
  exact `rm <path>` command to release it. Silent while the claim is actively
  refreshing (i.e. during real QA).

Verified by live execution against a scratch git repo, not just unit tests:
wrote a claim via the actual generated `PostToolUse` script with simulated
stdin, confirmed the `Stop` hook stays silent while fresh, artificially aged
the claim's mtime past threshold with `os.utime`, confirmed the reminder fires
with the correct message, and confirmed the printed `rm` command deletes the
right file.

Skill-level teardown steps (belt-and-suspenders, since hooks cannot reach into
the user's real Chrome to close tabs — only the owning session's own MCP calls
can) were added to `/implement`, `/qa` (new Phase 12), `/shipfast`,
`/shipthorough`, `/finish`: close every Claude-in-Chrome tab and Chrome
DevTools MCP page opened, release credential grants, leave the
`/soloship:browse` daemon running (its cookies/logins are shared state by
design).

**3. Test-account standard** (`skills/references/qa-test-accounts.md`),
generalized from a pattern the maintainer had already proven on a different
project (MAPS, `docs/qa/test-accounts.md`): one account per role/permission
level (including "absence" fixtures, e.g. an unclaimed pending invite), plus-
alias emails (`qa+<role>@<domain>`) resolving to one inbox so email-sending
flows are verified by observed evidence, a dedicated QA tenant, secrets kept
out of the repo, and idempotent/self-healing provisioning. Referenced from
`browser-qa-gate` (requirements inlined for self-containment) and mandated in
`/soloship:plan`'s QA Plan contract (authenticated rows must name their
account) and `/soloship:implement`'s account-creation flow.

## Why This Works

- **The priority order ranks isolation, not convenience.** Chrome DevTools MCP
  outranks Claude in Chrome specifically because it can't touch the user's
  real browser at all — exhausting an isolated surface before ever touching
  the browser the user lives in is strictly safer, even though Claude in
  Chrome is "more capable" (it has 1Password access). This was a deliberate
  maintainer correction mid-build, not a bug fix: the first version had the
  order backwards, and got corrected only because the maintainer could observe
  empirically that a second automation-banner window was a genuinely different
  surface from his everyday Chrome. The fix used
  `mcp__claude-in-chrome__list_connected_browsers` to get ground truth
  (`isLocal:true`, exactly one registered browser) before renaming or
  reordering anything a second time.
- **Naming "I can't fill in the password" a rule violation removes the silent
  dead end.** Previously that sentence sounded like an acceptable stopping
  point because no rule said otherwise. The explicit escalation ladder (test
  account → 1Password → ask-once) converts a plausible excuse into a checklist
  the agent must exhaust first.
- **The claim/release system uses mtime as ground truth instead of trusting
  stale in-memory belief.** A crashed or `/clear`'d session leaves no signal
  under the old model; under the new model its claim file simply stops
  refreshing and ages past `BROWSER_CLAIM_STALE_MIN` — a purely mechanical,
  no-memory-required way to distinguish "actively driving this browser" from
  "used it yesterday."
- **The `Stop` hook targets the collapse zone specifically** — the point late
  in a long session where context is thinnest and skill-prose teardown steps
  are most likely to be forgotten. Because it is a hook (mechanical, fires on
  every reply-end) rather than a skill instruction (probabilistic, competing
  with everything else in context), it survives exactly the failure mode
  end-of-session amnesia — that skill-level teardown steps can't reliably
  survive alone. The two layers cover different halves of the problem: the
  hook guarantees the *reminder* fires; the skill steps spell out the
  *action*, since hooks fundamentally cannot reach into the user's real Chrome
  to close tabs.
- **The test-account standard closes a gap the other two fixes would have
  reopened**: even with correct browser selection and correct busy/free
  detection, an agent with no documented account still can't complete
  authenticated QA. Generalizing from MAPS's already-battle-tested pattern
  (including the self-healing "absence" fixture requirement, added there after
  real leftover-fixture bugs) means this project inherits a solution that was
  already debugged elsewhere.

## Prevention

**General pattern for "agent forgets to release a shared resource at session
end":**

- **Heartbeat file + staleness threshold, never a boolean lock.** A lock that
  can be set but never guaranteed to unset is worse than no lock — it degrades
  into a permanent false-busy signal that every future session must learn to
  distrust, which then also masks the *real* busy case. A file whose mtime is
  refreshed on every use and judged stale past a threshold self-heals without
  anyone releasing anything.
- **Advisory teardown prose alone is not sufficient for anything that must
  survive the collapse zone** (the end-of-session state where only automated
  process reliably runs — Kathy Sierra's term, already cited in this repo's
  own research foundation). Any "remember to clean up X at the end"
  instruction living only in skill markdown should be treated as a reminder
  for the common case, paired with a mechanical Stop/SessionEnd hook that
  either enforces the cleanup or loudly nags the owning session while it can
  still act. Two-layer defense: SessionEnd releases on the clean-exit path;
  Stop catches the still-running-but-gone-quiet path SessionEnd can't see.
- **Reuse one definition of "dead," don't invent parallel ones.** This work
  deliberately reused `SESSION_IDLE_MIN` for the browser-claim staleness
  threshold rather than adding a second "presumed abandoned" constant. Every
  additional threshold that means approximately-but-not-exactly the same thing
  is a place future config drift can make one subsystem call a session dead
  while another still calls it alive. Before adding new staleness logic, check
  `<git-common-dir>/soloship/config.json` for an existing "no heartbeat for N
  minutes = treat as gone" key first.

**Checklist for adding a new MCP browser tool surface to Soloship:**

1. Add it to `browser-tooling-priority.md`'s ordered tier list with a one-line
   description of what it actually is and where it ranks — isolation before
   convenience, so a fully-isolated no-user-data surface always outranks a
   surface with access to the user's real session.
2. Add its tool-name prefix (`mcp__<surface>__*`) to the `PostToolUse` hook's
   matcher regex so claim-file heartbeats fire for it — an unmatched prefix
   means the claim system silently doesn't cover the new surface.
3. Decide the claim namespace deliberately: an architecturally isolated
   surface (its own managed browser instance) likely needs its own claim
   namespace under `<git-common-dir>/soloship/browser/`; a surface sharing the
   user's actual browser/profile with an already-registered surface should
   share that namespace so two tools can't both believe they hold an
   uncontended lock on the same real resource.
4. State explicitly whether the surface has credential/login access — this
   determines which tier of the "credentials are never a dead end" escalation
   ladder it belongs on; getting it wrong sends agents down a false escalation
   path.
5. Add its cleanup step to the "Cleanup When Browser Work Is Done" section —
   every tier needs an explicit teardown line, not an implied one.

**Terminology-drift caution:** "A Chrome window with automation attached"
describes both a fully-isolated managed surface and the user's-own-browser
surface — visually and even API-shape similar, architecturally opposite in
what they can access. Before naming or ranking a browser/tool surface in a
rule, verify empirically what it actually connects to (e.g. a
`list_connected_browsers`-style introspection call) rather than inferring from
the tool name or its on-screen presentation, then write the rule from the
observed fact.

**Regression check for a future refactor of the claim/release/reminder
system:**

1. Install into a scratch repo/session; simulate a `PostToolUse` event with a
   browser-tool `tool_name` matching the hook's regex; confirm a claim file
   appears with a fresh mtime.
2. Touch the claim file's mtime backward past `BROWSER_CLAIM_STALE_MIN`;
   simulate a `Stop` event for that same session; confirm the reminder fires
   for the *owning* session only.
3. Simulate a clean `SessionEnd`; confirm the claim file is removed.
4. Simulate two different session IDs touching the same tool prefix; confirm
   each gets its own claim file (or, for a surface intentionally sharing one
   real browser, confirm the second session's attempt is correctly reported as
   fresh/contended rather than silently overwriting the first).

## Related

- [`multibyte-char-adjacent-to-shell-var-eats-expansion-20260706.md`](../runtime-errors/multibyte-char-adjacent-to-shell-var-eats-expansion-20260706.md)
  — same `[hooks, generated-bash]` surface (`src/hooks.ts`). Its prevention
  advice (brace every `${VAR}`, keep emitted strings ASCII-only, QA by
  *executing* the generated script rather than reading it) applied directly
  while writing the new claim/release/reminder scripts.
- The `SESSION_IDLE_MIN` / session-presence heartbeat pattern this work reuses
  has no standalone solution doc — it shipped in commit `c5ce7dc` ("session
  presence layer — register/announce/heartbeat hooks + doctor line") and is
  documented only in `CHANGELOG.md`. `BROWSER_CLAIM_STALE_MIN` is a deliberate
  continuation of that same pattern, not a new one.
- Release mechanics for this work followed the existing four-file
  `release-version-sync` discipline; see
  [`parallel-session-release-collision-verify-before-npm-version-20260706.md`](../best-practices/parallel-session-release-collision-verify-before-npm-version-20260706.md)
  and
  [`shared-main-checkout-worktree-collision-during-release-20260715.md`](../best-practices/shared-main-checkout-worktree-collision-during-release-20260715.md).
