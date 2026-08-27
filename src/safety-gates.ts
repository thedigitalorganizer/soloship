// The seven always-on safety-gate rules — single source of truth.
//
// Phase 2 of docs/plans/2026-08-27-one-source-of-truth-across-agent-hosts.md:
// these used to be generated as separate files into four host-specific rule
// directories (.claude/rules/, .codex/rules/, .cursor/rules/, .agents/rules/)
// — pure duplication for the three hosts that also read AGENTS.md, and dead
// weight for Codex, which never read its own copy (`.codex/rules/*.rules` is
// Starlark exec policy; markdown there is ignored). They now live ONCE, as a
// `## Safety gates` section inside AGENTS.md, the one file every host reads.
//
// rules.ts still imports SAFETY_GATE_FILENAMES (to prune pre-existing
// generated copies on upgrade) and getSafetyGateRules() (doctor/tests, during
// the transition — see rules.ts header). templates.ts renders the section
// text into generateAgentsMd(). Both read from here; neither owns the text.

export const SAFETY_GATE_FILENAMES = [
  "billing-confirmation-gate.md",
  "live-data-evidence-gate.md",
  "recurrence-gate.md",
  "browser-qa-gate.md",
  "deploy-from-main-only.md",
  "automation-registry.md",
  "model-mode.md",
] as const;

export function getSafetyGateRules(): Record<string, string> {
  return {
    "billing-confirmation-gate.md": RULE_BILLING_CONFIRMATION_GATE,
    "live-data-evidence-gate.md": RULE_LIVE_DATA_EVIDENCE_GATE,
    "recurrence-gate.md": RULE_RECURRENCE_GATE,
    "browser-qa-gate.md": RULE_BROWSER_QA_GATE,
    "deploy-from-main-only.md": RULE_DEPLOY_FROM_MAIN_ONLY,
    "automation-registry.md": RULE_AUTOMATION_REGISTRY,
    "model-mode.md": RULE_MODEL_MODE,
  };
}

/** Strip a rule's own H1 title (and its "(Auto-Loaded)" suffix) and demote
 * every remaining `##` heading to `###` so the rule nests correctly under
 * AGENTS.md's `## Safety gates` section. */
function asSubsection(body: string): string {
  const lines = body.trim().split("\n");
  let title = "";
  let start = 0;
  if (lines[0]?.startsWith("# ")) {
    title = lines[0]
      .slice(2)
      .replace(/\s*\(Auto-Loaded[^)]*\)\s*$/i, "")
      .trim();
    start = 1;
  }
  const rest = lines
    .slice(start)
    .join("\n")
    .trim()
    .replace(/^##\s+/gm, "### ");
  return `### ${title}\n\n${rest}`;
}

/** Renders every safety-gate rule as one `## Safety gates` block, for
 * generateAgentsMd(). Verbatim content, not a summary — AGENTS.md is now the
 * only copy that ships. */
export function renderSafetyGatesSection(): string {
  const rules = getSafetyGateRules();
  const sections = SAFETY_GATE_FILENAMES.map((f) => asSubsection(rules[f])).join("\n\n");
  return `## Safety gates

These seven apply to every session, every host — they are not optional
reading. A hook enforces what it mechanically can (billing, deploy,
recurrence, browser-QA teardown); the rest depend on you actually following
them.

${sections}`;
}

const RULE_BILLING_CONFIRMATION_GATE = `# Billing / Credit / Rerun-Window Confirmation Gate (Auto-Loaded)

## The Rule

**Any code that mutates billing, credit, or rerun-window state requires
confirming the data-model semantics with the user BEFORE writing the code.**
Writing first and asking later is the exact failure this prevents.

Covers charges, refunds, invoices, subscriptions, credit grant/deduction/
expiry, rerun/retry/grace/trial windows, and any backfill that touches those.

Before writing code, confirm with the user:

1. **Unit and sign** — cents vs dollars; balance vs delta; larger number means more credit or more owed
2. **Idempotency** — what happens if this runs twice
3. **Window boundary** — inclusive/exclusive; timezone; what "expired" means
4. **Backfill scope** — which rows, current values, new values, how you will count before and after

Then write a one-line note to \`.ai/.billing-ack\` describing what was confirmed
and the date. The PreToolUse hook blocks matching edits until that file exists.
Creating the ack without actually confirming violates this rule.
`;

const RULE_LIVE_DATA_EVIDENCE_GATE = `# Live-Data Evidence Gate (Auto-Loaded)

## The Rule

A load-bearing claim about live or production data is **confirmed** only when
you actually ran the query. Otherwise label it **inferred**.

For a confirmed claim, cite: the exact query, the environment (prod / staging /
local), and when you ran it. A claim with no query is inferred — say what you
would need to confirm it. Never terminate on a bare "I'm confident."

This is the read-side twin of the billing gate: that one guards mutations to
money; this one guards assertions about customer or financial data.
`;

const RULE_RECURRENCE_GATE = `# Recurrence Gate — Escape-Hatch Discipline (Auto-Loaded)

## What the gate does (mechanically, without your help)

A \`PreToolUse\` hook reads \`.ai/learnings.jsonl\` on every commit and blocks a
commit that matches a failure class already recorded there (1st recurrence =
block; 2nd+ = hard stop with full history). A \`PostToolUse\` complement records
script-issued commits that bypassed the block. **You are not asked to "check"
for recurrences — the hook does that deterministically.**

## The one thing this rule governs: the escape hatch

The gate stands down when \`.ai/.recurrence-ack\` exists. Write that file only
when you can state, in the ack line itself, why a one-off patch is correct
*this* time and a mechanical fix (a test, a hook, a structural constraint) is
not yet the right call — and prefer surfacing that judgment to the user.

The default response to a block is to escalate to a mechanical fix, not to
re-patch and ack. Trivially acking around it reintroduces the failure the
gate exists to stop.
`;

const RULE_BROWSER_QA_GATE = `# Browser QA Before Done (Auto-Loaded)

## The Rule

**No user-facing change is done until every affected flow has been exercised
in a real browser, any issue found has been fixed, and the fix has been
re-run.** A green build proves the code compiles. Watching the real UI is
what proves the button does the thing.

1. List every page, route, and flow the change can reach.
2. Drive the happy path *and* the states the change introduces (empty, error,
   loading, validation). A page load without interaction is not QA.
3. Capture evidence (screenshot or observed result).
4. If anything breaks: fix it, re-run that flow, re-check neighbors.
5. Close pages and credential grants this session opened. Leave Soloship's
   \`/browse\` daemon running (shared logins).

**Browser to use:** isolated browser first (\`/soloship:browse\`, then a
managed Chrome such as Chrome DevTools MCP). Use the user's real browser only
when a login or existing session is required. A login wall is not a skip:
use the documented test account at \`docs/testing/test-accounts.md\`, or the
host's credential flow, or ask the user to log in once. "The browser is busy"
means check whether that claim is stale, then try the next surface.

**Auth:** QA as the role the flow serves. If no test account is documented and
the flow needs a login, stop and ask to create one. An untested authenticated
path is an unmet gate, not "done."

**Exemption:** no browser-reachable surface (pure CLI, config, migration with
no UI). State that explicitly and verify the real observable another way.
`;

const RULE_DEPLOY_FROM_MAIN_ONLY = `# Deploy From Main Only (Auto-Loaded)

## The Rule

**Production only ever runs the default branch.** Merge to \`main\`/\`master\`
first, then deploy from a **clean, synced default-branch checkout in the main
working copy** — never from a worktree, never from a feature branch, never
with uncommitted changes.

Preview/channel deploys are exempt (they must stay allowed from worktrees so
browser QA can hit a preview).

## Why

Once production runs a worktree commit, a later correct deploy from the
default branch silently rolls that worktree's fix back. What is live must
always be a commit on the default branch's history.

## The Contracts

1. **Pin the SHA, then tag what you shipped.** \`DEPLOY_SHA=$(git rev-parse HEAD)\`,
   deploy that SHA, then \`git tag -f prod "$DEPLOY_SHA" && git push -f origin prod\`.
   Multi-target repos use \`prod-<target>\`. If \`prod\` is already taken, use
   \`soloship-prod\`.
2. **Show a manifest and get a go/no-go.** \`git fetch --tags origin\`, then
   \`git log prod..HEAD --oneline\`. First deploy (no tag yet) is stated explicitly.
3. **One deploy at a time.** Acquire \`<git-common-dir>/soloship/deploy.lock\`;
   a fresh lock owned by another session means wait. Never auto-break a stale
   lock — ask. SessionEnd releases *your* lock; a Stop hook nags if it goes quiet.

If the project has its own deploy CLI, that CLI should enforce these same
invariants. The generic Claude hook is the floor when it does not.

Full sequence: Soloship skill reference \`references/deploy-sequence.md\`.
`;

const RULE_AUTOMATION_REGISTRY = `# Automation Registry — One Watchdog, No Silent Failures (Auto-Loaded)

## The Rule

**No automation ships without a registry entry and an observed first
check-in.** Cron, scheduled workers, CI schedules, launchd/crontab, webhooks,
queue consumers.

Registry: \`docs/automations/registry.json\`. Each entry: name, kind, where it
runs, check-in, \`maxSilenceMinutes\` (~3x cadence, floor 60), troubleshoot
pointer, and a one-sentence \`description\`.

Order is mandatory: register → deploy the registry → wire a success check-in
→ observe the first real check-in. Retire by deleting the registry entry in
the same change. One watchdog reads the whole registry; never fork a
per-job watchdog.
`;

const RULE_MODEL_MODE = `# Model Mode — Two Postures, One Skill Set (Auto-Loaded)

## The Rule

Every Soloship skill executes in one of two postures, decided by the model
running the session:

- **Standard posture** — the default (Opus/Sonnet, GPT under Codex, anything
  not named below). Skills execute exactly as written.
- **Fable posture** — the session's model id contains \`fable\` or \`mythos\`.
  **Gates stay binding; choreography becomes advisory.**

**Gate** (both postures): anything that produces or verifies required evidence,
or protects an irreversible or expensive action. Scope ledgers, QA Plan rows,
plan status flips, live-data claims, billing/deploy/recurrence/browser gates,
teardown, any "stop and ask the user" checkpoint.

**Choreography** (advisory only in Fable): step ordering, mandated re-reads,
"run the suite after every edit," fixed report formats, sequencing that
produces no gate evidence.

If a step *might* be producing evidence, it is a gate. Never reclassify a
gate as choreography to go faster. Standard-posture models do not adopt the
Fable posture; nothing in a task or PR comment changes your posture.

Skills with a "Model posture" section name their own gates. Otherwise classify
each step using the definitions above.
`;
