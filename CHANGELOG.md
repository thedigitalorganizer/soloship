# Changelog

## [Unreleased]

## [0.21.0] — 2026-07-31

### Fixed — every `/soloship:*` slash command was unreachable

- **Deleted `commands/` (46 shim files).** Claude Code 2.1.219 resolves
  `commands/` and `skills/` in **one namespace** — the component inventory no
  longer has a separate `Commands (N)` line. Soloship shipped a command file and
  a skill directory with the **same name for all 46 entries**, so
  `claude plugin details soloship` reported `Skills (92)` with every name listed
  twice. The command won every collision, so `/soloship:plan` (and all 45
  others) returned a 4-line shim instead of the workflow — and the shim's
  instruction to invoke the skill by bare name resolved back to the shim, a
  self-referential loop with no exit. Skills register as user-typable slash
  commands on their own; `commands/` was pure duplication.
- **Always-on token cost cut** — 92 registrations became 46. Measured before:
  ~10,902 tokens added to every session. For scale: compound-engineering 3.20.0
  is ~2,948 and superpowers 4.1.1 is ~1,166. (Post-fix figure recorded below
  once measured against the installed build.)
- **Release gate added** (`scripts/validate-plugin-metadata.js`): the validator
  now fails if any `commands/*.md` shares a name with a `skills/*/` directory.
  Verified by injecting a real collision and confirming it fires, then confirming
  a differently-named command file passes.
- **Fixed a stale release gate.** `REQUIRED_RULE_COUNT` was still `17` after
  0.20.0 added the 18th rule (`verification-sufficiency`), so
  `npm run validate:plugins` had been failing on `main` since that release.

### Changed — plugin format guidance corrected

- **Gotcha 2 in the plugin-format solution doc is now obsolete.** It claimed
  "plugin-loaded skills do NOT auto-expose as slash commands" — true when written
  on 2026-05-12, false as of Claude Code 2.1.219. That belief is what put the
  colliding shims there. Added **Gotcha 8** with the evidence, and updated
  Pattern #1 in `critical-patterns.md`, which had been instructing agents to
  place `commands/<name>.md` at plugin root.

## [0.20.0] — 2026-07-29

### Added — QA test-account standard + teardown enforcement

- **Test-account standard** (generalized from MAPS): `docs/testing/test-accounts.md`
  is now built to a five-point contract — one account per role (including
  absence fixtures like pending invites), plus-alias emails routed to ONE QA
  inbox so email flows are verified by reading the inbox, a dedicated QA
  tenant, secrets gitignored, idempotent provisioning with self-healing
  fixtures. Full template in `skills/references/qa-test-accounts.md`; contract
  inlined in the `browser-qa-gate` rule; `/plan` QA Plans must name the test
  account for authenticated rows; `/implement` builds new docs to the standard.
- **Teardown is now part of the QA Plan contract** (`qa-plan-in-plans` rule +
  `/plan`): executing a QA Plan ends with browser teardown, and a new **Stop
  hook** nags whenever a session still holds a browser claim that has been
  quiet for 10+ minutes — printing the exact release command — so cleanup
  survives the end-of-session collapse zone. Claims still auto-release at
  SessionEnd and expire by staleness.

### Added — Browser tooling priority + QA session cleanup

- **New installer rule `browser-tooling-priority.md` (18th rule).** Machine-wide
  browser selection order for QA and all browser work: Soloship's `/browse`
  daemon first, Chrome MCP (`claude-in-chrome`) second — with the 1Password
  credential flow (`request_credentials` → `autofill_credential` →
  `enter_verification_code`) named as the sanctioned way to complete
  authenticated flows instead of refusing — and the host app's built-in browser
  last. Also defines the busy-browser protocol (claim-liveness check, fall down
  the list, never dead-end) and the end-of-QA cleanup contract.
- **Browser claim/release hooks.** PostToolUse on browser MCP tools
  (`mcp__claude-in-chrome__*`, `mcp__chrome-devtools__*`, `mcp__Claude_Browser__*`)
  stamps `<git-common-dir>/soloship/browser/<session>.json` (mtime = heartbeat);
  a new **SessionEnd** hook event releases the claim when the session ends.
  Stale claims expire via `browser_claim_stale_min` (published in
  `config.json`), so a session that died holding a browser no longer blocks the
  next QA run with a phantom "another session is using it."

### Changed

- **Browser surface terminology corrected and priority reordered** (maintainer
  feedback, 2026-07-29). The order is now: `/browse` → **Chrome DevTools MCP**
  (Google's official Chrome MCP; launches its own managed automation-banner
  Chrome, isolated from the user's browser) → **Claude in Chrome** (the Claude
  extension inside the user's own everyday Chrome; the 1Password surface) →
  host built-in browser. Isolation ranks above convenience: the user's personal
  Chrome is only touched when a flow needs their logins or 1Password. Earlier
  "Chrome MCP" naming conflated the DevTools-managed window with the extension;
  the rule now spells out that they are different surfaces.
- **`browser-qa-gate.md`** now references the priority rule for browser
  selection and adds a teardown-when-QA-passes section.
- **Teardown steps added to `/implement` (QA Gate), `/qa` (new Phase 12),
  `/shipfast`, `/shipthorough`, and `/finish`:** close Chrome MCP tabs you
  created, release credential grants, leave the `/browse` daemon running
  (shared by design).
- **`/browse` skill** now states it is the first-choice browser surface and
  that the daemon must not be disconnected as cleanup.
- **Codex AGENTS.md template** mentions the browser priority + cleanup contract.

## [0.19.0] — 2026-07-28

### Added — Claude 5 adaptation (Tier 1)

- **Two new cross-cutting concerns via the concern registry:
  `delegation-discipline` and `verification-sufficiency`.** Claude 5 models
  delegate and verify proactively; when a skill already mandates dispatches
  and evidence, the instinct stacks on top and the run pays twice. Both
  concerns cap stacking without ever licensing skipping (the counter-pressure
  sections are load-bearing). Wired into 17 skills; reference contracts in
  `skills/references/`.
- **Both concerns also ship as installer rules (16th and 17th rules)** into
  user projects' `.claude/rules/` and `.codex/rules/`. A new arch test
  extracts key phrases from the reference contracts at test time so the rule
  copies cannot silently drift.
- **SDD re-vendored from Superpowers v6.2.0.** Review findings now resume the
  original implementer (rounds 1–3) and escalate to a fresh implementer on a
  stronger model (rounds 4–5), with a five-round circuit breaker and
  controller adjudication instead of an unbounded fix loop; re-reviews are
  scoped to the fix diff; the SDD workspace is plan-scoped
  (`.ai/sdd/<plan-slug>/`), removing the stale-ledger cross-plan failure.

### Changed

- **Corpus-wide tone softening for Claude 5.** Forceful 4.x-era phrasing
  (ALL-CAPS mandates, threat framing, psychological-pressure tables) calmed
  to firm prose with identical gate semantics — Sonnet 5 can flag coercive
  skill text as prompt injection (Superpowers #1878), and Claude 5 follows
  calm instructions literally. Includes a deliberate, documented divergence
  from upstream wording in the vendored verification-before-completion,
  test-driven-development, and debug skills.

## [0.18.1] — 2026-07-23

### Changed

- **`/learn` now commits its own artifacts (new Step 5.5, mandatory).** An
  uncommitted solution doc left in a shared main checkout reads as foreign
  dirty state to every parallel session. Learn now ends by staging exactly the
  files it created/modified (solution doc, AGENTS.md updates, registry/
  inventory drift fixes, the learnings index only if tracked — never
  `git add .`), committing with a `docs(solutions):` message, and verifying
  the commit contents via `git show --stat`. Pushing stays with the ship
  skills. Only exemption: the user explicitly asked to hold the commit.

## [0.18.0] — 2026-07-23

### Added — component-reuse system + cross-cutting concern registry

Solves the duplicate-component problem (a second EmailComposer gets built,
then a fix ships to one of two copies) at every layer, plus the meta-problem
of keeping ~20-skill cross-cutting sweeps alive as the skill set evolves.

- **New auto-loaded rule `component-reuse.md` (15th rule).** Search-before-
  create is checkable, not aspirational: read `docs/architecture/COMPONENTS.md`
  + grep, cite what you found, extend on purpose match, state blast radius when
  editing shared components. Carries its own anti-over-DRY guardrail — the rule
  of three (never abstract on first or second use; >7 props is a smell).
- **New skill `/soloship:component-inventory` (46th skill).** Generates
  `docs/architecture/COMPONENTS.md` — name, file, purpose, props, usage sites
  per component (React/Vue/Svelte), plus a "Possible duplicates" section the
  user decides on. **Delta-update:** unchanged rows (including prose) are
  preserved byte-for-byte, so a no-change re-run produces no diff; content
  outside the marker-delimited block is never touched.
- **Duplicate-component warn hook (18th hook protection).** PostToolUse on
  Edit/Write: a just-written `.tsx`/`.jsx` file exporting a component whose
  name is already exported elsewhere gets flagged to the agent (stderr, never
  blocks — same warn pattern as the live-data gate). Uses the real
  `HOOK_MODIFIED_FILE` contract, repo-wide `git grep` pathspec (monorepo-safe,
  node_modules skipped by construction), ignores re-exports and type-only
  exports by construction, fails safe (any internal error is silent exit 0).
  10 behavioral fixture tests exec the generated script end-to-end — and
  caught a real bug pre-ship: macOS git grep ERE has no `\b`, so the collision
  match uses a boundary class instead.
- **Cross-cutting concern registry (the meta-fix).** One reference file per
  concern (`skills/references/component-inventory.md` — the contract + a
  canonical pointer template), a manifest (`skills/references/concerns.json`),
  and `__arch__/concerns.test.ts` enforcing the wiring bidirectionally: every
  listed skill carries the marker, every marker is registered, the reference
  file exists, and the canonical wording sits next to each marker. A vendored
  refresh that wipes a touchpoint turns `npm test` red instead of rotting
  silently. Future sweeps copy this shape.
- **26 skills wired** with the canonical pointer at their existing anchors:
  generation (audit Agent 1, bootstrap Step 5.5, component-inventory),
  plan-time consumption (plan Step 2 beside the REGISTRY read, writing-plans,
  brainstorm, office-hours, spec), build-time consumption (implement Scope
  Lock + Follow Existing Patterns, frontend-design pre-generation gate,
  executing-plans, subagent-driven-development, ui-ux-pro-max hierarchical
  retrieval), review-time enforcement (eng-review Step 0, ceo-review 0B,
  plan-design-review 0C, code-review dup lens, review Pass 3, ui-audit
  report-only), lifecycle (learn drift check, cleanup Agent 6 freshness
  auditor, finish nudge, verification-before-completion Touch-Map row).
  autoplan inherits via the loaded review skills.
- **`EXPECTED_RULES` updated** in the fitness suite; a 15th rule can't be
  silently dropped from the installer.

### Fixed

- **Root `LICENSE` file added (MIT).** package.json declared MIT but the repo
  had no LICENSE file — GitHub reported "no license", which legally means no
  grant. One-file fix.
- **README counts corrected**: 15 always-on rules (the list had been
  undercounting by two — plan-artifact-lifecycle and live-data-evidence were
  installed but unlisted), 18 hook protections, 46 workflow skills.
- **`commands/cron.md` and `commands/status.md` stubs backfilled** — 43 of 45
  skills had command stubs; these two were drift from their original ship.

## [0.17.0] — 2026-07-15

### Added — goal-anchored loop spine (Phases 0–4)

The deferred half of the loop-spine plan, built after a kill-test discovery loop
resolved the runtime mechanics empirically rather than by assumption.

- **Plan-completeness gate (17th hook protection).** A `PreToolUse` Edit/Write
  gate blocks a write into `docs/plans/` that is missing `## Goal` or
  `## Done-When` — a plan's observable stop condition is now mechanically
  required, not advisory prose. All three plan templates gained the sections;
  eng-review and review skills gained a quality check that the Done-When items
  are genuinely observable. Escape hatch: `.ai/.plan-status-ack`.
- **Start-of-run scope lock.** `/implement` now declares the deliverable, the
  observable stop condition, and an out-of-scope parking lot at run start —
  closing the gap the commit-time Scope Ledger leaves open. Lighter mirror in
  `/brainstorm`.
- **Resumable orchestration reference.** `references/resumable-orchestration.md`
  codifies a kill-tested checkpoint design: idempotent sink (load-bearing),
  per-item state file via atomic temp+rename (git-independent), retry-then-
  dead-letter, and budget enforcement on the Workflow/Agent tool surface (a
  markdown skill only *instructs* a budget). Wired into `/cron` add mode and
  `/implement`'s observable advisor-vs-orchestrator routing. Evidence:
  `docs/solutions/patterns/2026-07-15-resumable-batch-checkpoint-strategy.md`.
- **Evidence-gate escalation wired.** The evidence gate's financial/irreversible
  escalation tier now points at the shipped resumable-orchestration pattern
  (independent sub-agent re-derivation), replacing its "not yet shipped"
  placeholder.

## [0.16.1] — 2026-07-15

### Fixed — `init` merges hooks instead of replacing the whole block

`installHooks` overwrote the entire `hooks` block in `settings.local.json`, so a
re-`init` or upgrade would wipe any hook the user added themselves. It now stamps
its own entries (`_soloshipManaged`) and **merges**: user-custom hooks and other
settings keys are preserved, only Soloship's own hooks are replaced. A best-effort
fingerprint sweep cleans up legacy (pre-marker) Soloship hooks so the first
upgrade init doesn't duplicate them. Verified idempotent — init ×3 keeps a custom
hook and never grows the Soloship set.

## [0.16.0] — 2026-07-15

### Added — live-data evidence gate (1 new rule, 1 new hook)

Soloship verified claims against **code** (`plan-claim-verification`) and gated
**mutations** to money (`billing-confirmation-gate`), but had no gate on
**assertions about data**. The most-cited, highest-cost friction was the agent
stating a fact about live/production data it never verified — "the numbers
matched exactly", "linking is free", "that person isn't in the system" — and
being wrong, on real customer and financial data.

The fix makes **evidence the currency of confidence**: a load-bearing data claim
is `confirmed` only when backed by a query with **provenance** (exact query,
environment, timestamp, result + row count, verdict); otherwise it is `inferred`
and must be labeled so. A Claims Table alone proves formatting, not truth — the
provenance fields are what make it real.

- **live-data-evidence-gate rule** — the read-side twin of the billing gate.
  Defines the provenance Claims-Table schema and the honest scope: it makes
  evidence cheap to demand and its absence visible at the write and
  data-publishing boundaries; it does not (and cannot) mechanically block a bare
  conversational assertion.
- **live-data evidence hook** (PostToolUse/Edit|Write, **warn-only**) — when a
  `docs/solutions`, `docs/reports`, or plan file asserts a high-precision
  data claim without a Claims Table, it warns so the agent adds provenance or
  labels the claim inferred. Narrow scope + precision-first phrase list keeps
  false-positives low; warn-not-block avoids training ignore-the-warning behavior.
- **evidence-loop reference** (`skills/references/evidence-loop.md`) — the bounded
  "factually confident / find every loophole" verifier that terminates on a
  provenance-complete Claims Table or a named unverified list. Wired as an
  explicit step into `/plan` claim-verification and the `shipfast`/`shipthorough`
  pre-deploy checks.

Deferred to a follow-up (loop-spine plan): Goal/Done-When required in plans,
start-of-run scope lock, resumable orchestration, and the subagent escalation
tier for financial/irreversible claims.

## [0.15.0] — 2026-07-14

### Added — plan truth gates + document artifact lifecycle (3 new hooks, 1 new rule)

Plan status was the only Soloship invariant with **no mechanical floor**. `/plan`
wrote `status: planned`, `/implement` and `/finish` were *told* to flip it to
`in-progress` and `done` — and nothing verified that they did. In the wild this
produced plans that claimed `Not started` for work that was live in production.
That is not cosmetic: agents read plans and act on them, and a plan that lies
about itself can send the next agent to rebuild a shipped feature.

The fix checks the plan's claim against **git evidence** at the two moments
evidence exists — the first code commit and the merge — instead of trusting a
self-report at the tail of a long skill, where context runs out and the write
silently never happens.

- **plan-truth gate** (PreToolUse/Bash) — blocks a **code** commit on a branch
  whose plan still says `planned`. Docs-only commits pass: writing the plan is
  the moment `planned` is honest.
- **plan-merge gate** (PreToolUse/Bash) — blocks merging a branch whose plan is
  still `planned`/`in-progress`. After the merge there is no natural moment left
  that would prompt the flip.
- **plan-namespace gate** (PreToolUse/Edit|Write) — `docs/plans/` holds live
  plans only. A file without valid status frontmatter is blocked, and the message
  names the folder it actually belongs in.
- **Stop-hook backstop** — surfaces any plan whose open status contradicts an
  already-merged branch, plus any statusless file sitting in `docs/plans/`.
  Catches work done conversationally, with no branch, outside any skill.
- Escape hatch `.ai/.plan-status-ack`, mirroring the billing and recurrence
  gates. The anti-gaming clause applies: silence the gate only with a real,
  written reason. The default correct response is to fix the status.

**New document taxonomy**, each folder with one artifact type and one lifecycle.
The exploration skills (`grill-me`, `brainstorm`, `spec`) were writing their
outputs *into* `docs/plans/` — they were the source of the pollution, and now
write to `docs/drafts/`:

- `docs/drafts/` — drafts, design notes, grill/brainstorm output. **Deleted when
  promoted into a plan** (the plan records `promoted_from:`).
- `docs/handoffs/` — session handoffs. **Deleted when consumed** (the plan records
  `handoff:`). A handoff that outlives its execution describes a world that no
  longer exists.
- `docs/reports/` — point-in-time snapshots. Historical, never actionable, never
  swept.
- Decision logs go to the existing `docs/architecture/decisions/`.

Each folder ships a `README.md` stating its contract, so an agent that lands there
learns the rule without reading a skill. `/cleanup` now sweeps misfiled and
orphaned artifacts; `/implement` and `/finish` perform the self-cleaning deletes.
New auto-loaded rule: `plan-artifact-lifecycle.md`.

### Fixed — Stop and phone-a-friend hooks were silently swallowing every message

Both hooks JSON-escaped their output with a hand-rolled
`sed "s/\"/\\\\\"/g"` that, after template-literal and shell-quote expansion,
rendered as `s//\\/g` — an **empty regex**. sed exited with `first RE may not be
empty` and the hook emitted nothing at all. Every message these two hooks ever
tried to surface was lost. Both now delegate to a real JSON encoder
(`emitSystemMessage`) instead of hand-escaping in shell. Found while testing the
new plan-truth backstop, which was the first message reliably non-empty enough to
notice the failure.

### Added — reply-timestamp Stop hook (16th hook protection)

- New Stop hook stamps every assistant reply with the local date and time (`{"systemMessage": "7/12/2026 9:52:50 PM CDT"}` style). Session-log tooling can read these stamps to reconstruct when work actually happened — a session resumed days later would otherwise be dated by when it was logged, not when it was done. Uses the machine's local timezone; format lives in the exported `REPLY_TIMESTAMP_FORMAT` constant.

### Fixed — upgrade no longer clobbers customizable CI scaffolding

- `npx soloship upgrade` no longer touches `.github/workflows/ci.yml` or `__arch__/fitness.test.ts`. Both are install-once, customize-me scaffolding — a force refresh overwrote a project's customized fitness test (deliberately-removed generic assertions came back and failed). `installCi` now also treats the fitness test as write-once, so re-running `init` can't clobber it either.

## [0.13.0] — 2026-07-06

### Added — Automation registry + one watchdog + /soloship:cron

- **New skill `/soloship:cron` (45th)**: the management console for every automation a project owns. Status mode reads `docs/automations/registry.json`, queries the project's watchdog status endpoint, live-discovers automations (launchd, crontab, wrangler/vercel/CI cron triggers, webhook routes), and flags drift both directions (unregistered live jobs, ghost entries). Troubleshoot mode walks the scheduler→job→check-in chain (diagnose-only). Add mode is the build-time contract: register → deploy → wire → **observe the first check-in**. Remove mode de-registers retired jobs.
- **New installed rule `automation-registry.md` (12th)**: no automation ships without a registry entry and an observed first check-in; one watchdog per system, never per-job watchdogs; retiring an automation removes its entry.
- **`npx soloship init`** now scaffolds `docs/automations/registry.json` + `README.md`; generated CLAUDE.md/AGENTS.md reference the registry as the automation source of truth.
- **`soloship doctor`** warns when cron triggers exist (wrangler/vercel/GH Actions schedule) but no automation registry does — silent-failure-by-construction detector.
- **`/soloship:audit`** gained Agent 11 (Automation Surface Inventory): every cron trigger, webhook receiver, and local scheduled job + its monitoring state; unmonitored automations become findings. **`/soloship:bootstrap`** gained Step 5: seed the registry from the audit inventory so live automations are never invisible.
- Reference implementation (dead-man's-switch watchdog: sync-log + heartbeat check-ins, silence OR persistent-error darkness, consolidated alerts with 24h cooldown, unconditional weekly digest, external healthchecks.io meta-ping) ships in Command Center; the standard's registry format and contracts are project-agnostic.

### Added — Deploy discipline + cross-session coordination & canonical work tracking (merged same release)

- **Session presence layer** (new SessionStart + PostToolUse hooks): every session registers on the shared whiteboard at `<git-common-dir>/soloship/` — the one directory all worktrees of a repo share — and heartbeats after every tool call. Starting a session in a repo with other live sessions announces them ("2 other active sessions… shared git index/stash caution applies"). Thresholds live in exported constants and are rewritten to `config.json` every session start so hooks and skills can never drift. `soloship doctor` reports the coordination dir state.
- **New installed rule `deploy-from-main-only.md` (11th workflow rule)**: production only ever runs the default branch; deploy = merge first, then deploy from a clean, synced main checkout. Preview/channel deploys stay free for worktree browser QA. Documents the deploy-train concept, the moving `prod` tag, the manifest + go/no-go, and the deploy lock.
- **New PreToolUse deploy-discipline gate**: mechanically blocks a production deploy run from a worktree, from a non-default branch, with a dirty tree, or past another session's fresh deploy lock.
- **Shared `references/deploy-sequence.md`** consumed by `/soloship:shipfast` Step 6 and `/soloship:shipthorough` Step 12: verify place → acquire lock (atomic, first-writer-wins) → fetch + manifest (`git log prod..HEAD`) → explicit go/no-go → deploy → move + push the `prod` tag (`prod-<target>` for multi-target repos) → release lock on success and failure. Even shipfast shows the manifest and asks once.
- **Canonical plan status**: unified frontmatter vocabulary `backlog | planned | in-progress | blocked | done | abandoned` (legacy mapping from `Not started`/`active`/`completed`), plus `progress`, `updated`, `claimed_by`, `branch` fields. `/soloship:plan` writes `planned`; `/soloship:implement` atomically claims the plan on start (a fresh foreign claim stops and asks; a stale one is taken over with a note), updates progress each phase, sets `done` and clears the claim; `/soloship:finish` writes `done`/`abandoned`; `/soloship:cleanup`'s lifecycle scanner became the reconciler (fixes unambiguous frontmatter drift from git evidence, flags ambiguity, clears dead claims). Freshness/TTL warnings now apply only to `planned`/`in-progress`.
- **New skill `/soloship:status` (44th)**: one read-only dashboard — active sessions (who's working where, on what), the plan board (claims overlay frontmatter for in-flight work), and deploy state (what `prod` points at, merged-but-undeployed delta, lock holder). Repairs stay in `/soloship:cleanup`.

### Added — QA Plan in every plan (verification method matched to work type)

- `/soloship:plan` now requires a mandatory `## QA Plan` section in every plan: one row per touched surface, verification method matched to the work type (browser QA via `/soloship:browse` as the default for anything user-facing; real requests for APIs; real command runs for CLIs; pre/post data checks for migrations; dry-runs for skill/prompt changes; consumer-level smoke for pure logic). "Run the test suite" alone never passes — automated tests are necessary but not sufficient.
- Enforcement gate and final verification checklist in `/soloship:plan` reject plans missing the section or using a mismatched method; all three issue templates (MINIMAL/MORE/A LOT) include the section.
- `/soloship:implement` Step 2.6 renamed to **QA Gate**: it now executes every row of the plan's QA Plan (deriving one from the diff for older plans), with browser QA remaining mandatory for any browser-reachable surface.
- QA Gate fix-and-re-verify loop generalized to **every QA Plan row**: any failing row → fix → re-execute that row (and adjacent rows the fix could touch) → repeat until every row passes clean. Only two exits: all rows pass with evidence, or the failure is genuinely unfixable now and the work is reported to the user as NOT done. Never "done with known QA failures."
- New installed rule `qa-plan-in-plans.md` (10th workflow rule) — installed into both `.claude/rules/` and `.codex/rules/` by `npx soloship init`, so the plan-time QA requirement cascades to user projects and plans written outside `/soloship:plan`.

## [0.12.0] - 2026-07-02

### Added

- First-class Codex plugin packaging: `.codex-plugin/plugin.json`, repo-local `.agents/plugins/marketplace.json`, plugin metadata validation, and local Codex dogfood sync/install scripts.
- `npx soloship init|upgrade --agent claude|codex|both` with Codex-facing `.codex/rules/` installation and `AGENTS.md` guidance.
- Shared skill compatibility guidance for Codex, including fallbacks for Claude-only tool names, AskUserQuestion, subagent dispatch, Codex/Claude install paths, and nested `codex exec` outside-voice behavior.

### Changed

- `soloship doctor` now reports Claude Code, Codex, and shared project guardrail status separately.
- README install/update docs now separate Claude plugin, Codex plugin, and npm project guardrails.

## [0.11.0] - 2026-06-26

### Added — Browser QA Gate (no plan is "done" without real browser QA)

- **New auto-loaded rule `browser-qa-gate.md`**, installed into every project by `init` / `upgrade`. No work is "done / complete / fixed / shipped" until every user-facing flow it touches has been exercised in a real browser via `/soloship:browse`, any issue found is fixed **and re-verified by re-running the flow**, and evidence is captured. A green build and passing tests are necessary but not sufficient. The only exemption is a change with genuinely no browser-reachable surface, stated explicitly and verified another way.
- **Test-account flow.** Authenticated flows are QA'd as a real logged-in user. If no test account is documented at `docs/testing/test-accounts.md`, the agent stops and asks whether to create + document one (credentials kept in a gitignored file, non-production / disposable only); thereafter that documented default is used unless a specific account is named. Never skip an authenticated flow and call it done.
- **Enforced across every completion path:** `/soloship:implement` (new Step 2.6, blocks entering Ship It), `/soloship:shipthorough` (new Step 9.6, before the merge), and `/soloship:shipfast` (Step 7 now browser-QAs the actual fixed flow on the live URL).

### Changed — vendored skills refreshed and made fully self-contained

- **Superpowers refreshed to 6.0.3.** `using-git-worktrees` (isolation detection + `.worktrees/` default), `finish` (environment detection), `writing-plans` (Global Constraints + per-task Interfaces blocks), `subagent-driven-development` (full v6 rewrite with vendored scripts + prompt files), `verification-before-completion` / `test-driven-development` (confirmed current), and `debug` (+ its 4 sidecar files vendored, fixing dangling links). `executing-plans` is deliberately kept on its batch-checkpoint model — the human-in-loop alternative to subagent-driven-development that upstream v6 dropped.
- **`learn` upgraded to Compound Engineering's compound 3.14.3 two-track schema** — bug-track solution docs now require `root_cause` (from an enum) and `resolution_type`; knowledge-track docs make them optional.
- **5 CE research agents vendored** (`repo-research-analyst`, `learnings-researcher`, `best-practices-researcher`, `framework-docs-researcher`, `spec-flow-analyzer`) into `skills/references/agents/`, scrubbed stack-neutral for Soloship's stacks. `plan` / `brainstorm` / `code-review` / `deepen-plan` now dispatch these instead of naming agents that don't exist for Soloship-only users.
- **Every dangling Compound Engineering ecosystem reference scrubbed** across the 7 CE-derived skills: broken `/workflows:*` and `/technical_review` commands mapped to their `/soloship:*` equivalents; CE-only review personas pointed at Soloship's existing checklists; CE / Rails / iOS-specific tooling (`bin/rails`, `agent-browser`, `imgup`, `/xcode-test`, hardcoded plugin paths) genericized or removed.

### Fixed

- Reconciled conflicting vendored-version stamps and documented the **per-skill cherry-pick model** in `THIRD_PARTY_NOTICES.md`: each skill's own `<!-- Vendored from ... -->` header is the authoritative pin, and the aggregate `VERSION` records the newest. (Superpowers → 6.0.3, Compound Engineering → 3.14.3, gstack NOTICES corrected to 1.32.0.0.)

### Note

CE 3.x's multi-file / multi-agent architecture is **deliberately not adopted** — Soloship keeps its curated single-file-embed-in-a-wrapper model on purpose, per its anti-complexity premise for non-coders. The CE work here closes self-containment leaks and ports the genuinely transferable research specialists, not the architecture.

## [0.10.0] - 2026-05-25

### Added

- **New auto-loaded rule `parameterize-constants.md`**, installed by `init` / `upgrade`: meaningful literals (numbers, URLs, limits, file paths, repeated strings) get named constants. Refactor un-parameterized values in the section you're editing, then surface other sites for the user to decide on.
- `.worktrees/` added to the ignore set; extended the CLAUDE.md Audience note for the non-coder framing.

## [0.9.0] - 2026-05-16

### Added — recurrence gate (cross-session pattern detection, externalized)

Implements `docs/plans/2026-05-16-recurrence-gate.md`. The function this externalizes: noticing that the *same* non-fix has been applied before. `/clear` wipes the agent's memory of that; `.ai/learnings.jsonl` (written by `/learn`) does not. Until now only the maintainer caught repeats, by hand. This makes it mechanical.

- **`PreToolUse`/`Bash` recurrence gate (`buildRecurrenceGateScript`).** On every `git commit`, reads the existing `.ai/learnings.jsonl` (never a new file) and counts deterministic matches: staged files ∩ an entry's `components` **and** commit-message tokens ∩ its `key`/`insight`. Escalation: **0 = silent allow**, **1 = block** (names the prior solution path; escape hatch `.ai/.recurrence-ack`), **2+ = hard stop** with full recurrence history. No LLM judgment — matching is mechanical on the existing schema, so it can't reintroduce the compliance failure it exists to remove.
- **Degraded mode for heredoc commits.** CE/Soloship commit flows use heredoc bodies that can't be token-parsed from the command string. Rather than silently under-matching the most common commit style, the gate falls back to file-overlap-only and **warns instead of blocking at the 1-match tier** — but still **hard-stops at 2+** (verified). Under-catch, never false-block.
- **`PostToolUse`/`Bash` recurrence audit (`buildRecurrenceAuditScript`).** A commit issued from inside a node/python script isn't a Bash commit the gate can block. This fires after the script's Bash call, detects the match post-hoc, records it to `.ai/.recurrence-log`, and surfaces it — so the bypass is loud and the next commit escalates. Hand-typed terminal commits outside Claude Code remain out of scope (documented).
- **New auto-loaded rule `recurrence-gate.md`.** Deliberately *not* a "remember to check" rule (that would violate the plan's core constraint that nothing may depend on the agent choosing to check). Its sole job is the **anti-gaming clause** on the escape hatch — mirroring the billing gate's: writing `.ai/.recurrence-ack` to silence the block without a genuine reason that a mechanical fix isn't the right call defeats the instrument and violates the rule.

Both hooks wired into `installHooks`; structurally cloned from the billing-confirmation gate. Verified by the spec's mandated observed-behavior tests (positive block, silent negative, ack escape, tier-2 hard stop, heredoc degraded-warn, no-ledger pass, 2+ overrides degraded, PostToolUse records scripted-commit bypass).

### Migration

Nothing to migrate. New `soloship init` / `soloship upgrade` runs include both hooks + the rule. v1 is per-project (`.ai/learnings.jsonl` is per-project today); cross-project matching is a tracked `BACKLOG.md` follow-up, sequenced after v1 proves it doesn't false-block.

## [0.8.1] - 2026-05-16

### Fixed — public-surface privacy sweep

Audited everything that ships into other users' instances (plugin `skills/**`) and into their projects (emitted rules/templates/hooks from `dist/`). The emitted-into-user-projects surface was clean. Two leaks fixed:

- **`skills/shipthorough/SKILL.md`** hardcoded the maintainer's first name ("Shawn is a solo developer") in a skill instruction that loads into every plugin user's Claude. Generalized to "Soloship's user."
- **`skills/browse/dist/server-node.mjs`** (git-tracked, ships via plugin) had the maintainer's absolute build path baked in 3× as `var __dirname = "/Users/.../skills/gs-browse/src"`. Root cause: bun's bundler injects `var __dirname = "<absolute build path>"` and `scripts/build-node-server.sh` sanitized `import.meta.dir` but not `__dirname`. This was also a latent **correctness** bug — `__dirname` is load-bearing (`path.resolve(__dirname, "..", "extension")`, icon/welcome paths), so on any other machine those resolved to a nonexistent path. Fixed at source: the build now repoints `__dirname` at the existing portable `__browseNodeSrcDir` runtime shim, plus a new build-time leak guard (Step 5) that fails the build if any absolute `/Users//home//root/` path survives post-processing. Bundle rebuilt; a regression test asserts no absolute path ships; fixed a pre-existing unquoted-path bug in the build test.

Author metadata in `.claude-plugin/plugin.json` / `marketplace.json` (`thedigitalorganizer`, contact email) is intentional published-package attribution and left as-is. The repo's own `CLAUDE.md` and `.claude/rules/*` reference the maintainer but are Soloship's own dev governance — not shipped via npm, not loaded into user instances — and are intentionally untouched.

## [0.8.0] - 2026-05-16

### Added — three friction-to-automatic gates (from `/insights`)

Each converts a defect class the maintainer currently catches by hand into one the plugin catches automatically.

- **Scope Ledger Gate (in-run, before any terminal commit).** New Soloship-authored section in `verification-before-completion/SKILL.md`, wired as a MANDATORY pre-commit step into `implement` (incremental + final commits), `shipthorough` (new Step 9.5, before the merge), and `shipfast` (Step 4). Before the terminal commit of any task, the agent must emit a **Scope Ledger** (shipped / remaining / explicitly out-of-scope) and a **Touch Map** — `git grep` the changed value/name across the whole repo, one row per hit, each resolved with evidence. Kills both the stale-state class (16+ `wrong_approach`: fix shipped to 1 of N copies of a value) and premature "phase done" over-claims. In-run by design: the user does not interrupt, so the catch must precede the commit.
- **Plan-claim verification (before a plan proceeds).** Every factual assertion in a plan ("X already done", file/function locations, test-coverage claims, pricing/rate/limit values, dependency claims) must be `git grep`'d against the live repo before the plan enters review or implementation. Added as a MANDATORY gate in `plan/SKILL.md` Step 4 (with a Claims Table), as `autoplan` Phase 0 Step 2.5 (gate before the review pipeline), and as a new auto-loaded rule `plan-claim-verification.md` so it cascades regardless of entry path.
- **Billing / credit / rerun-window confirmation gate.** New auto-loaded rule `billing-confirmation-gate.md` + a new `PreToolUse` (Edit|Write|MultiEdit|NotebookEdit) hook `buildBillingGateScript` that **blocks (exit 2)** any edit to billing/credit/rerun-window code (matched by file path or billing-state identifiers) until the agent has confirmed the data-model semantics — unit & sign, idempotency, window boundary, backfill scope — with the user and recorded it in `.ai/.billing-ack`. This was the single most expensive recurring friction (two backfill rounds + reverts).

### Why

`/insights` (185 sessions) showed these three were the patterns that *repeated* and were caught only by manual vigilance. Plugin-level permanence removes the dependency on the maintainer noticing each time. Deploy rebuild-and-verify (MAPS `/ship`-specific), the MCP-retrieval habit (project CLAUDE.md), and the two-modes workflow insight (personal workflow) were deliberately kept out — they are not general plugin behaviors.

### Migration

Nothing to migrate. New `soloship init` runs include both new rules and the billing hook automatically. Plugin skills are symlinked so the Scope Ledger / plan-claim gates are live immediately. Existing projects keep their current `.claude/rules/` and hooks until re-init (`soloship init` skips existing rule files unless `--force`); the billing hook + new rules can be added to a project on their own.

## [0.7.0] - 2026-05-16

### Added — deploy-freshness gate (the recurring prod-gap fix)

A `/insights` review across 185 sessions found the single most expensive recurring friction was correct code that never reached production because a build or migration step was skipped before deploy (stale frontend bundle, unapplied D1 migration, partial pricing fix). This release adds the mechanical floor for that.

- **New `PreToolUse`/Bash hook in `src/hooks.ts` (`buildDeployFreshnessScript`).** Before any deploy command: **blocks (exit 2)** a deploy that ships a local build artifact (`dist/`, `build/`, `.next/`, `out/`, `.output/public`) when any source file is newer than the freshest artifact file *and* the command doesn't itself run a build (it inspects the `package.json` `deploy` script to decide). Auto-passes build+deploy commands and remote-build platforms (Vercel/Netlify/Fly). **Warns** on D1-backed `wrangler deploy` that isn't a `migrations apply`. Pure filesystem/git/package.json inspection — no AI judgment. Scans from the repo root (pruning deps/build/VCS) so root-entrypoint projects are covered, not just `src/`-layout ones.
- **`/soloship:shipfast` and `/soloship:shipthorough` hardened.** Both gained a non-skippable post-deploy step: resolve the live URL, fetch it, and confirm the *specific change* is visible (a 2xx is not proof — the old version returns 2xx too) plus confirm migrations applied to prod. Matching verification-checklist items added so "Shipped" can't be claimed on an unverified deploy.

### Why

Everything else in the friction data was one-off; this pattern repeated and broke prod at least three times. The hook makes the stale-bundle failure mechanically impossible to repeat; the skill changes close the "reported done but never verified live" gap from the workflow side.

### Migration

Nothing to migrate. New `soloship init` runs include the hook automatically. Existing projects keep their current hooks until re-init; the deploy-freshness hook can be added to a project's `.claude/settings.local.json` `PreToolUse` array on its own.

## [0.6.0] - 2026-05-12

### Changed (solo-developer defaults)

Two skill defaults flipped to match how solo developers actually ship. Both are backwards-compatible — the previous behavior is still available on explicit request — but the defaults now match the project's name.

- **`/soloship:implement` defaults to creating a worktree, not a bare branch.** A new Step 1.7 in `skills/implement/SKILL.md` overrides the Compound-Engineering "Setup Environment" menu (which presented a worktree as "Option B") and routes new feature work through `/soloship:using-git-worktrees` by default. Falls back to a manual `git worktree add` snippet if the skill isn't available. Skip and use a bare branch only if the user explicitly says so or the change is the trivial 1-2 step exception.
- **`/soloship:implement` no longer auto-creates GitHub PRs at the end of execution.** A new Step 2.5 in `skills/implement/SKILL.md` intercepts the final step of CE's Phase 4 ("Ship It") and replaces `gh pr create` with a local merge into the base branch (checkout base → pull → merge → push base → delete feature branch → remove worktree). PRs only happen when the user explicitly asks for one ("open a PR," "push it up for review") or picks `/soloship:finish` Option 2.
- **`/soloship:shipthorough` Step 10 rewritten.** Was hard-coded "push + `gh pr create`"; now defaults to the same local-merge-and-push flow as `/soloship:implement`. PR creation is preserved behind explicit opt-in. The "Done" report block and verification checklist were updated to match.

### Why

Soloship's audience is solo developers. The PR-and-review pattern is correct for teams; for a solo operator it's pure latency between "done" and "live" — and it trains agents to think the workflow ends at github.com instead of in the working repo. The bare-branch default has a separate failure mode: when Soloship users run 2-5 parallel agent processes against the same repo (which is the project's whole positioning), branches in a single checkout collide on the working tree, and `git status` becomes useless. Worktrees isolate them.

### Migration

Nothing to migrate. The first time you run `/soloship:implement` or `/soloship:shipthorough` after updating, you'll see new behavior at two points:

- At the start of execution, the agent will create a worktree under `.worktrees/<branch-name>` instead of running `git checkout -b` in the current directory. Verify your `.gitignore` contains `.worktrees/`; the worktree skill adds it automatically if missing.
- At the end of execution, the agent will merge the feature branch into your base branch locally and push the base branch instead of opening a PR. If you want a PR for a particular change, say so before the merge step ("open a PR for this") or run `/soloship:finish` and pick Option 2 after the work is done.

If you're working in a team setting where PRs are required, set up a project-local rule that overrides the default, or invoke the explicit PR opt-in on every run.

## [0.5.0] - 2026-05-12

### Changed (breaking)
- **All vendored skill names dropped their source prefix.** `ce-*`, `sp-*`, `gs-*`, `im-*`, and `uiux-*` prefixes are gone. Slash commands are now plain English names: `/soloship:browse` (was `gs-browse`), `/soloship:cso` (was `gs-cso`), `/soloship:code-review` (was `ce-review`), `/soloship:ui-audit` (was `im-audit`), `/soloship:test-driven-development` (was `sp-test-driven-development`), and so on. Source attribution lives in `THIRD_PARTY_NOTICES.md` and the README; users no longer need to know what `ce`/`sp`/`gs`/`im`/`uiux` mean to invoke a skill.
- **Five 1:1 routers merged into the target skill.** `/soloship:debug` now contains the full systematic-debugging methodology inline (was a router to `sp-systematic-debugging`); same pattern for `/soloship:plan`, `/soloship:implement`, `/soloship:learn`, and `/soloship:design-review`. Each merged skill keeps Soloship's preamble (iron-law reminders, solution-search step, common rationalizations) and appends the upstream methodology.
- **Three brainstorming variants folded into `/soloship:brainstorm`.** Compound Engineering's `brainstorm` and `brainstorming` plus Superpowers' `brainstorming` are now sections of one skill; the demand-discovery path (`/soloship:office-hours`) stays separate.
- **Plan-review slash commands renamed for clarity.** `/soloship:gs-plan-ceo-review` → `/soloship:ceo-review`; same pattern for `eng-review`, `devex-review`, and `plan-design-review`. `gs-plan-design-review` kept the `plan-` prefix because `/soloship:design-review` is taken by the visual UI review skill.
- **Net surface:** 51 commands → 43 commands. No source prefixes; no `(Soloship) Soloship —` doubling.

### Why
On a fresh-install Mac mini, slash commands like `/soloship:ce-plan` and `/soloship:gs-browse` leaked implementation detail that no end user has any way to interpret. The source prefix existed for attribution; that need is fully served by the GitHub README and `THIRD_PARTY_NOTICES.md`. For 1:1 routers, the indirection produced ugly double-prefixed names (`/soloship:debug` calling `sp-systematic-debugging`) without adding value over a single merged skill.

### Migration
After updating the plugin (`/plugin update soloship@soloship`), any `/soloship:<old-prefixed-name>` you had muscle-memorized will report "unknown command". Strip the prefix:
- `/soloship:ce-review` → `/soloship:code-review`
- `/soloship:gs-browse` → `/soloship:browse`
- `/soloship:gs-plan-eng-review` → `/soloship:eng-review`
- `/soloship:im-audit` → `/soloship:ui-audit`
- `/soloship:sp-test-driven-development` → `/soloship:test-driven-development`
- Everything else: drop the 2-3 letter prefix and you've got it.

## [0.1.3] - 2026-05-11

### Added
- **`/soloship-finish` slash command.** Surfaces Superpowers' development-branch-completion discipline as a user-facing skill. Use after implementation work is done to walk the merge / PR / cleanup options. Internally the skill is at `skills/finish/`, vendored from Superpowers v4.1.1.

### Fixed
- **Attribution comment added to 4 sp-* skills.** `sp-executing-plans`, `sp-subagent-driven-development`, `sp-using-git-worktrees`, and the renamed `skills/finish/` were missing the standard `<!-- Vendored from superpowers v4.1.1 (Jesse Vincent) -->` header that every other vendored skill carries. These were rescue-added in v0.1.1 and the header got missed. MIT compliance was already satisfied by `skills/vendored/superpowers/LICENSE`; this is the voluntary in-file source clarity we apply elsewhere.
- **Stale counts in vendored-source docs.** `skills/vendored/superpowers/README.md` said "5 skills"; reality is 9. `THIRD_PARTY_NOTICES.md` had the same drift. Both now list all 9 Superpowers skills with the appropriate Soloship rename note for `finishing-a-development-branch` → `finish`.

### Changed
- **`skills/sp-finishing-a-development-branch/` renamed to `skills/finish/`** with `name: finish` in frontmatter. Cross-references in the three sibling sp-* skills that invoke it (`executing-plans`, `subagent-driven-development`, `using-git-worktrees`) updated to use the new slash form `/soloship-finish`.

## [0.1.2] - 2026-05-11

### Fixed
- **gs-browse arch mismatch.** v0.1.1 shipped a pre-compiled arm64 binary for `dist/browse`; Intel Macs failed with `bad CPU type in executable`. Soloship no longer ships pre-compiled launcher binaries — `scripts/build-soloship.sh` compiles for the host architecture on first use (~2 min one-time per machine). Eliminates the entire arch-mismatch class of bugs, including the project-level-install + CPU-upgrade failure mode.
- **`build-soloship.sh` is now genuinely self-sufficient.** Previously it only printed a curl command and errored if bun was missing. Now it installs bun with a SHA-pinned `curl bun.sh/install` (matching upstream gstack's preamble), runs `bun install`, compiles the launcher, builds the Windows fallback, and downloads Playwright Chromium — all in one invocation.
- **bun PATH propagation in non-interactive shells.** Bash tool calls from agents spawn non-interactive shells that skip `~/.zshrc`, so a freshly-installed bun wasn't reachable. SETUP blocks across all 5 browse-aware skills (gs-browse, gs-design-review, gs-qa, gs-office-hours, gs-plan-design-review) and the build script now prepend `~/.bun/bin` to `PATH` explicitly.
- **SETUP block precision.** Previously SETUP could only report `NEEDS_SETUP` (a dead-end signal). It now discovers the skill directory before checking for the binary and returns `NEEDS_SETUP: <path-to-build-script>` so the calling agent can run the exact build command without searching. New `NEEDS_SETUP_NO_DIR` state distinguishes "skill installed but unbuilt" from "Soloship plugin missing entirely."

### Changed
- **Every Soloship skill description now starts with `Soloship — `** (51 SKILL.md files). Makes plugin ownership obvious in the slash-command picker when the user also has gstack, Superpowers, or other source plugins installed. Stripped 11 leftover `(gstack)` attribution parentheticals from descriptions.
- **`skills/gs-browse/dist/` no longer ships compiled binaries.** Only `dist/server-node.mjs` (arch-neutral Windows fallback bundle, ~530KB) and `dist/bun-polyfill.cjs` remain tracked. Plugin clone is ~110MB lighter.

### Added
- **`docs/known-issues/gs-browse.md`** — captures issues surfaced during Phase 5 fresh-machine testing that don't have local fixes yet (snapshot `-i -a -o` multi-element error in the annotate pipeline; daemon's silent-fallback-to-help behavior on unknown commands). All have documented workarounds.
- SKILL.md note clarifying there is no `cookie-clear` command and listing the three real ways to reset session state (`state save/load`, app sign-out, `$B js` with the cookie-clearing one-liner).

## [0.1.1] - 2026-05-11

### Added
- **Vendored gs-browse v1.31.1.0** with Soloship-native paths (`~/.soloship/`, no `GSTACK_HOME` env var, runtime-discovery of install paths). Restored visual QA and screenshot-diff capabilities for Soloship-only users — `/gs-qa`, `/gs-design-review`, `/gs-plan-design-review`, and `/gs-office-hours` work without a separate gstack install. *(Note: v0.1.1's binary was arm64-only; see 0.1.2 for the fix.)*

### Changed
- **Self-containment pass.** Stripped external dependencies on gstack from every vendored skill so Soloship customers don't need to install gstack/Superpowers/CE/Impeccable/ui-ux-pro-max separately. Vendored attribution archive at `skills/vendored/<source>/` preserves licenses + version pins.
- Vendored missing Superpowers skills and the `code-reviewer` agent that earlier skills referenced.

### Fixed
- `prepublishOnly` script now enforces version bump before `npm publish` (prevents accidental duplicate-version publish failures).
- `files` allowlist in `package.json` no longer references a non-existent `templates/` directory.

## [0.1.0] - 2026-04-07

### Added
- npm installer (`npx soloship init`) with stack detection, folder scaffolding, doc generation, hooks, rules, and CI setup
- 16 Claude Code skills: audit, bootstrap, brainstorm, plan, implement, review, debug, learn, shipfast, shipthorough, qa, security, design-review, retro, spec, onboard
- 9 Claude Code hooks: dangerous command blocking, auto-lint, CHANGELOG check, dependency graph, plan validation, workflow navigator, handoff reminder, context injection, architecture fitness
- 4 workflow rules: solution search, plan materialization, plan rationale, plan lifecycle
- GitHub Actions CI template with architecture fitness functions
- Complete design documentation and research archive
