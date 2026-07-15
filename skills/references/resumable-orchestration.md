# Resumable Orchestration

Canonical reference for **long or batched agent runs that must survive
interruption** — a token/spend cap, a `kill -9`, a crashed session, a machine
reboot. Used by `/soloship:cron` (add mode), `/soloship:implement`, and any skill
that fans work out across many items.

The design here is not assumed — it was chosen by a kill-test experiment. See the
evidence and the answers to every open design question in
`docs/solutions/patterns/2026-07-15-resumable-batch-checkpoint-strategy.md`.

---

## 1. The decision rule — advisor vs orchestrator (observable)

Before starting, the skill picks one of two shapes and **states its choice and
the one-line reason out loud**, where the user can see it. This is not a hidden
auto-behavior and it is not a knob the user has to tune — it's a decision the
skill makes and explains.

| Shape | Use when | What it looks like |
|---|---|---|
| **Advisor** | The work is **one hard task that needs steering** — a tricky refactor, a design call, anything where a human's judgment mid-flight changes the outcome. | Stay in one agent. No fan-out. The value is the back-and-forth, not throughput. |
| **Orchestrator** | The work is a **splittable batch of similar items** — N files to migrate, N records to process, N pages to QA. | Fan out: a bounded worker per item on a cheap execution tier, while the lead keeps the quality gate and merges results. Resumable checkpoint (below) tracks the batch. |

**State it like this:**

> "Orchestrator: this is 40 independent files to migrate — fanning out, cheap
> tier per file, checkpointing to `.ai/checkpoints/migrate.json`."

or

> "Advisor: this is one architectural change that needs your calls as I go —
> staying single-agent, no batch checkpoint."

If you can't say in one line why you chose the shape, you haven't understood the
work yet.

---

## 2. The checkpoint (proven design: atomic single-file state machine)

A batch is resumable when three things are true. The kill-test proved that
**correctness comes from #1, not from where the checkpoint lives** — no file can
be transactionally bound to an external side effect, so ordering alone is racy.

### 2a. The sink is idempotent (load-bearing)

Every item's side effect must be safe to run twice. Give it a natural or explicit
**idempotency key** (the item id, a Stripe idempotency-key, a DB upsert on a
unique column, an existence check before append). This is what makes "resume
re-runs an in-progress item" safe. Without it, a crash in the window between
"did the side effect" and "recorded that I did it" **duplicates** the side effect
on resume — in the kill-test, the non-idempotent strategy duplicated on 6 of 15
random kills. For money movement or customer-facing writes, that duplicate is the
whole disaster.

### 2b. Explicit per-item state + atomic write

One checkpoint file, one entry per item, four states:

```
pending  →  in-progress  →  done
                         ↘  failed   (dead-lettered)
```

Write it with **write-temp-then-rename** (`rename()` is atomic on one
filesystem), never an in-place rewrite. That removes the partial-write race
without needing an append-only log (the log's only advantage over this is moot
once you rename, and it grows unbounded and needs replay to read).

```json
{
  "spent": 400,
  "items": {
    "file-a.ts": { "state": "done",   "tries": 1 },
    "file-b.ts": { "state": "done",   "tries": 1 },
    "file-c.ts": { "state": "failed", "tries": 3, "error": "parse error" },
    "file-d.ts": { "state": "pending","tries": 0 }
  }
}
```

You can `cat` this file and see exactly where the batch is — which matters when a
non-coder operator asks "did it finish?".

### 2c. Correct transition ordering

Per item:

1. `tries++`; mark **in-progress**; atomically write checkpoint.
2. Do the work; apply the **idempotent** side effect.
3. Mark **done** (charge spend here, once); atomically write checkpoint.

On restart: skip `done` items, skip `failed` items, re-attempt everything else.
Because step 2 is idempotent, re-attempting an item that was killed after step 2
but before step 3 is a safe no-op — no duplicate. The kill-test passed 15/15
random kills with this ordering.

### 2d. Retry / dead-letter policy

- Retry a failing item up to `MAX_RETRIES` (default **2** beyond the first
  attempt).
- After that, mark it **failed** (dead-letter), record the error, and **continue
  the batch** — a poison item must never stall or silently drop the whole run.
- **Do not charge spend for a failed attempt** (only a `done` transition charges).
- Keep a defensive total-iteration ceiling so a mis-configured retry can't loop
  forever.
- Surface dead-lettered items to the user at the end: "3 of 40 items failed after
  retries: […] — want me to investigate?"

### 2e. Git-independent, always

The checkpoint is a **plain file the run owns** (e.g. `.ai/checkpoints/<name>.json`,
gitignored). It is **never** a git commit. Forcing per-item commits pollutes
history, breaks on a dirty tree, and fails entirely for batches that aren't code
(emails, API calls, data rows). This was an explicit requirement — the whole
mechanism works with zero git involvement.

---

## 3. Budget enforcement — enforce on the tool surface, only *instruct* in markdown

**A markdown skill can only *instruct* a budget; it cannot *enforce* one.** If a
real per-worker or per-run token cap must hold, run the batch behind Claude
Code's **Workflow / Agent tools**, whose runtime actually enforces it:

- `budget.remaining()` / `budget.total` — the run's token target; `agent()` calls
  **throw** once the cap is reached (a hard ceiling, not advice).
- `opts.model` / `opts.effort` — put the cheap tier on per-item execution, reserve
  the strong tier for the lead's quality gate.
- `isolation: "worktree"` — when workers mutate files in parallel.

The file checkpoint above gives **resumability**; the Workflow tool gives
**enforceable budget**. Use both together for a capped, resumable batch. A
pure-markdown skill must **state** the budget as guidance and must not claim to
enforce a cap it structurally cannot.

---

## 4. Retrofit scope

- **New automations** built through `/soloship:cron` add mode that are
  batch-shaped **must** wire in this checkpoint as part of being built — not as a
  follow-up.
- **Existing / ad-hoc long runs** adopt this as an **opt-in reference** when they
  next hit a cap; a skill cannot safely rewrite a running job's internals from the
  outside. There is no silent auto-retrofit.

---

## 5. Minimal checklist

- [ ] Shape chosen (advisor / orchestrator) and the one-line reason stated to the user
- [ ] Sink is idempotent (natural key or explicit idempotency key)
- [ ] Checkpoint file with per-item states, written via temp+rename, gitignored
- [ ] Transition order: in-progress → idempotent side effect → done (spend charged once)
- [ ] Retry to MAX_RETRIES then dead-letter + continue; iteration ceiling; failures surfaced at end
- [ ] Real budget cap? → run behind the Workflow/Agent tools, not markdown instruction
- [ ] Kill-test it: start → kill mid-item → resume → completed items skipped, no duplicate side effects
