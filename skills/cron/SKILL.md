---
name: cron
description: |
  The management console for every automation a project owns — cron jobs,
  scheduled workers, local launchd/crontab jobs, and webhooks. Reads the
  project's automation registry (docs/automations/registry.json), queries its
  watchdog status endpoint when one exists, live-discovers automations that
  exist but were never registered, and troubleshoots anything dark. Also the
  build-time contract: any NEW automation gets registered and wired for
  check-in as part of being built, never as a follow-up. Use when asked
  "what crons do we have", "is X still running", "why didn't Y run",
  "/cron", or whenever you are about to BUILD a new cron/webhook/scheduled
  automation (run `add` mode before calling it done).
---

## Host Compatibility

If you are running this skill in Codex, read `../references/codex-compatibility.md` before following host-specific tool instructions. Claude Code should continue to use the Claude-specific tools and command wrappers described here.

# Soloship Cron — Unified Automation Console

Silent automation failure is the enemy: a cron or webhook dies and nothing
notices until it's too late. This skill is the operator surface for the
Soloship automation standard:

- **Registry** — `docs/automations/registry.json` (single source of truth per
  project; `docs/automations/README.md` is the human view, and may instead be
  a pointer to the registry's real path if the project keeps it elsewhere).
- **Dead-man's-switch watchdog** — every automation checks in on success;
  ONE watchdog per system scans check-ins against the registry and alerts on
  silence. Never build a per-job watchdog — register the job instead.
- **This skill** — see everything, troubleshoot anything, and enforce the
  registration contract when new automations are built.

Registry entry shape (the Soloship standard):

```json
{
  "statusEndpoint": "/api/automations/status",
  "automations": [
    {
      "name": "nightly-sync",
      "kind": "cloud-cron | local-launchd | local-crontab | webhook | ci-schedule",
      "description": "one plain-English sentence: what it does and why it matters",
      "runsOn": "where it executes",
      "checkin": "sync_log | heartbeat",
      "maxSilenceMinutes": 360,
      "troubleshoot": "file paths, plists, solution docs"
    }
  ]
}
```

`description` is optional but recommended — it's what humans see wherever
automations are listed (status endpoints, alert emails, dashboards).

Threshold rule of thumb: `maxSilenceMinutes ≈ 3× expected cadence`, floor 60;
~30h for daily jobs on a machine that sleeps; webhooks get expected-activity
windows (they have no cadence) and a **baseline check-in seeded at wiring
time** so "never checked in" doesn't false-alarm before the first real event.

## Mode Routing

| User intent | Mode |
|---|---|
| "/cron", "what's running", "show automations", "are my crons ok" | **status** (default) |
| "why didn't X run", "X looks dead", "troubleshoot X" | **troubleshoot** |
| About to build a new cron/webhook/scheduled job | **add** |
| Retiring/deleting an automation | **remove** |

---

## Mode: status (default)

Build ONE table from three sources, then flag drift between them.

**1. Read the registry.** `docs/automations/registry.json` (or follow the
pointer in `docs/automations/README.md`). No registry? Say so and offer to
scaffold one from the discovery results below — that offer is the adoption
path for existing projects.

**2. Query the watchdog status endpoint** if the registry names one
(`statusEndpoint`). It returns per-entry `lastSeen` / `dark` / `reason`
computed by the same code that sends alerts. If the endpoint sits behind an
auth wall (e.g. Cloudflare Access), use the project's documented agent-access
pattern — commonly `cloudflared access curl <url>` or a service token whose
location the project's CLAUDE.md/AGENTS.md names. Endpoint unreachable →
degrade gracefully: report registry + live discovery only, and say the live
health column is missing.

**3. Live-discover reality** — automations exist whether or not anyone
registered them:

```bash
# Local machine (macOS)
ls ~/Library/LaunchAgents/ 2>/dev/null | grep -v -E "com\.(google|apple)|keystone"
crontab -l 2>/dev/null
# Cloud (per project stack — check what exists)
grep -rn "crons" wrangler.jsonc wrangler.toml 2>/dev/null          # Cloudflare
grep -rn "schedule" .github/workflows/*.yml 2>/dev/null            # CI schedules
grep -rn "cron" vercel.json 2>/dev/null                            # Vercel
# Webhook receivers (route definitions)
git grep -ln "webhook" -- "src/**" 2>/dev/null | head
```

**4. Render one table** sorted worst-first:

```
| automation | kind | where | last check-in | state | threshold |
```

When entries carry a `description`, include it as a column (or as a short
line under each row) — it's the plain-English answer to "what is this job?".

Then the **drift section** — the part that actually protects the user:
- **Unregistered:** found live but not in the registry → name each one and
  offer to register it (this is how the audit gap gets closed incrementally).
- **Ghosts:** registered but not found live → likely retired without
  de-registering; will alert forever. Offer `remove`.
- **Dark:** anything the status endpoint (or your own timestamp math) shows
  past its threshold → offer `troubleshoot`.

Keep the summary to: N healthy, M dark, K unregistered, J ghosts.

## Mode: troubleshoot <name>

Diagnose-only in v1: find the cause, propose the fix, apply it only as
normal approved work — this skill never restarts/disables jobs on its own.

1. **Read the registry entry** — its `troubleshoot` field names the files,
   plists, and solution docs to start from. Search `docs/solutions/` for the
   automation's name and symptoms (solution-search rule applies).
2. **Establish the last-known-good:** status endpoint `lastSeen`, then the
   underlying store if reachable (sync-log table, heartbeats table), then
   local evidence — job logs, `~/.config/automation-watchdog/checkin-failures.log`
   (check-ins that failed to send), `launchctl list | grep <label>` (second
   column is the last exit code).
3. **Localize the break.** The chain is: scheduler fired → job ran → job
   succeeded → check-in sent → check-in recorded. Walk it in order; the first
   broken link is the diagnosis. A job that runs-but-errors is a different
   fix than a scheduler that never fires, which is different again from a
   working job whose check-in is failing (auth drift, network).
4. **Report:** cause, evidence, proposed fix, and — after the fix ships —
   re-verify by observing a real check-in land (the fix-and-re-verify loop;
   a fix is done when the flow is SEEN working, not when code changed).

## Mode: add (the build-time contract)

Run this whenever a new automation is about to be built. The order is
mandatory — it's what makes silent-failure-by-construction impossible:

1. **Register first.** Add the entry to `docs/automations/registry.json`
   (name, kind, runsOn, checkin, maxSilenceMinutes via the 3× rule,
   troubleshoot pointer, and a `description` — one plain-English sentence
   saying what it does and why it matters; writing it is part of
   registering, not a follow-up).
2. **Deploy the registry** (if the watchdog imports it at build time, the
   check-in endpoint rejects unregistered names until this ships — that
   rejection is the contract enforcing itself).
3. **Wire the check-in:**
   - Cloud worker that already writes a sync log → nothing to do.
   - Local scheduled job → invoke it through the check-in wrapper
     (`run-with-checkin.sh <name> <command…>` — runs the job, checks in on
     exit 0 ONLY, always propagates the job's own exit code, and a failed
     check-in never fails the job).
   - Webhook → call the heartbeat recorder after successful auth, and seed a
     baseline check-in at wiring time.
4. **Observe the first real check-in** (trigger the job once or wait a
   cycle; watch the row/status change). An automation whose first check-in
   was never OBSERVED is not done — "it should check in" is an assertion,
   not evidence.
5. **Batch-shaped? Make it resumable.** If the automation processes many
   items and could be interrupted mid-run (a token/spend cap, a timeout, a
   crash), wire in the checkpoint from
   `references/resumable-orchestration.md` **as part of building it, not a
   follow-up**: per-item state file (temp+rename, gitignored), idempotent
   sink, retry-then-dead-letter. A batch job that dies at item 300 of 500 and
   restarts from item 1 either duplicates side effects or never finishes —
   the exact failure the checkpoint prevents. **Retrofit scope (decided):**
   this contract binds **new** batch automations here; existing/ad-hoc long
   runs adopt the reference opt-in when they next hit a cap — a skill can't
   safely rewrite a running job from the outside, so there is no auto-retrofit.

## Mode: remove

Retiring an automation = delete its registry entry in the same change that
retires the job (a registered-but-deleted job alerts forever), redeploy, and
confirm it's gone from the status endpoint. If a coherence test pins slots
to registry entries, it will fail until both sides move together — that's by
design.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "I'll register it after I see it working" | Backwards. Registration is one JSON entry and makes the watchdog watch you get it working. Unregistered-but-live is exactly the state that rots into a silent failure. |
| "This job is too trivial to monitor" | Trivial jobs fail silently too, and their failures compound quietly (a stale index, a missed onboarding email). If it's worth scheduling, it's worth one registry entry. |
| "I'll build a quick watchdog just for this job" | One watchdog, ever. A per-job watchdog is the fragmentation this system exists to end. Register the job. |
| "The build is green so the automation works" | A green build proves nothing about a scheduler firing at 9am. Observe the first real check-in. |
| "The webhook never checked in but it's probably fine" | A webhook that has never checked in is indistinguishable from one that silently can't. Seed the baseline, then let the activity window judge. |

## Verification

- [ ] Mode identified and stated
- [ ] status: registry + endpoint + live discovery all consulted (or their absence stated), drift section rendered
- [ ] troubleshoot: chain walked in order, cause named with evidence, fix re-verified by an observed check-in
- [ ] add: registered → deployed → wired → first check-in OBSERVED, in that order
- [ ] remove: entry deleted in the same change, endpoint confirmed clean
