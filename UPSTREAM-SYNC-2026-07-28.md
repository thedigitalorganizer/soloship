# Upstream sync research — 2026-07-28 (working-branch artifact; consume then delete/move)

Context: researched the three main vendored upstreams for changes since Soloship's
vendored baselines, focused on Claude 5 family (Opus 5 / Sonnet 5 / Fable 5)
adaptation. Produced on branch `claude/opus-5-soloship-adapt-097y3y` alongside the
delegation-discipline + verification-sufficiency concern work (see that branch's
commits). Full agent reports live in the session that produced this; the digest
below is self-sufficient.

## Baselines vs current

| Upstream | Vendored | Current (2026-07-28) | Cadence |
|---|---|---|---|
| Compound Engineering (EveryInc/compound-engineering-plugin) | 3.14.3 (2026-06-24) | **3.20.0** (2026-07-22) + unreleased main through 07-24 | ~weekly |
| Superpowers (obra/superpowers) | 6.0.3 (2026-06-18) | **6.2.0** (2026-07-23) | biweekly-ish |
| gstack (garrytan/gstack) | 1.32.0.0 | **1.60.2.0** (2026-07-10); changelog fetched 1.52.2.0→1.60.1.0 only (1.32→1.52 delta unretrievable, file truncation) | every few days |

## Claude 5 posture upstream

- **CE:** Kieran Klaassen (X, ~07-27): Opus 5 "broke Compound Engineering… it kept
  returning control to the user. Even though it's an autonomous flow… So I have
  started to rewrite." Corroborated by Every's "Vibe Check: Claude Opus 5" —
  Opus 5 verifies/narrates/scopes/delegates more proactively, so skills that
  already instruct all four compound into waste. Their merged response so far:
  **`ce-retune`** (PR #1252, 2026-07-24) — measurement-first corpus retuning
  (baseline → quantify noise → adversarial flagging → tracked removal passes vs a
  pre-registered bar), explicitly rejecting "read the prose and rewrite what looks
  wrong." Full rewrite in-flight on main, no tagged release yet.
- **Superpowers:** no commit explicitly names Claude 5, but: v6.0.0's merged
  single task-reviewer was reportedly validated with Fable (blog-sourced,
  secondary); steady trimming of recaps/social-proof and consolidation into
  rationalization tables; **open issue #1878: Sonnet 5 flags forceful/ALL-CAPS
  skill instructions as prompt injection** (filed 06-30, unresolved).
- **gstack:** no visible Claude 5 adaptation yet (model-overlays still track
  opus-4-7); heavy token-efficiency and review-verification work instead.

## Incorporation candidates (prioritized)

### Tier 1 — evaluate for adoption soon
1. **Superpowers v6.0.0: merged single task-reviewer** (replaces dual
   spec-compliance + code-quality reviewers; claimed ~50-60% fewer review tokens,
   ~2x faster). Soloship's vendored SDD still uses the dual-verdict
   task-reviewer-prompt.md. Direct cost cut on every SDD task.
2. **Superpowers v6.2.0: resume-based review-fix loop** — resume the SAME
   implementer for fixes instead of dispatching fresh fix subagents, with a
   five-round circuit breaker + controller adjudication. Soloship SDD currently
   dispatches fresh fixers (and its own docs record a fix wave costing more than
   all tasks combined). Also: plan-scoped SDD workspace (Soloship uses `.ai/sdd/`
   unscoped — cross-plan contamination risk).
3. **CE `ce-retune` methodology** (PR #1252) — adopt the measurement-first
   retuning shape for Soloship's own corpus against Claude 5, instead of
   prose-judgment rewrites. Pairs with the concern-marker work already on this
   branch (which is additive; retune governs what to REMOVE).
4. **Sonnet 5 tone audit** (SP issue #1878) — Soloship's Iron Law / "STOP" /
   ALL-CAPS anti-rationalization tables risk being flagged as injection by
   Sonnet 5's heuristics. Audit phrasing intensity; consider softening to firm
   prose without losing the gate semantics. Note interplay: 4.x-era models needed
   the aggression; Claude 5 follows calm instructions literally.

### Tier 2 — cheap wins / aligned with existing lessons
5. **gstack v1.57.7.0: mandatory unresolved-decisions verdict** at the end of
   every plan review ("NO UNRESOLVED DECISIONS" or the explicit list) — cheap add
   to ceo-review/eng-review/design-review/plan-design-review.
6. **gstack v1.54/1.56: skeleton+sections "carve" pattern** — 59% cut in /ship's
   always-loaded cost by loading prose on demand. Apply to Soloship's heaviest
   skills (office-hours ~1000+ lines, autoplan, devex-review, design-review).
7. **CE v3.20.0 `reasoning-elevation.md`** — precedence-ordered model/effort
   escalation (caller > in-prompt intent > config) for reasoning-heavy steps with
   a cheap orchestrator; complements SDD's Model Selection section.
8. **CE #1054/#1074: behavior-verification evidence + silent-pass detection** in
   reviews — same lesson as Soloship's verification-theater solution doc; check
   CE's mechanics for anything ours misses. gstack v1.60.1.0 found the same class
   of bug (dual-voice eval silently broken) — industry-wide pattern.

### Tier 3 — situational
9. **gstack v1.58.3.0 GBrowser "Layer C" stealth** — diff against Soloship's
   rebuilt /browse for anti-detection gaps.
10. **gstack v1.57.10.0 Codex-by-default single toggle** with graceful fallback —
    simpler than per-skill codex invocation in the review family.
11. **CE v3.15.0 unified brainstorm+plan artifact** — collapses two steps into one
    readiness-staged artifact; touches the vendored plan methodology heavily.

## Vendoring cautions (from repo's own lessons)
- Any re-vendor must run the 5-category external-dependency audit
  (docs/solutions/best-practices/vendor-skills-without-external-deps-*.md).
- Vendored refreshes will wipe the concern markers added on this branch —
  `npm test` catches it; re-paste templates from skills/references/*.md.
- gstack review skills have structurally drifted upstream (plan-* vs live-site
  split) — no longer 1:1 with Soloship's flat names; a refresh is a remap, not a
  copy.
- Releases: 4-file version sync, minor bump for new skill behavior.
