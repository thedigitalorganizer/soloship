# Model Mode — Two Postures, One Skill Set (Auto-Loaded)

## The Rule

Every Soloship skill executes in one of two postures, decided by the model
running the session:

- **Standard posture** — the default (Opus/Sonnet, GPT under Codex, anything
  not named below). Skills execute exactly as written.
- **Fable posture** — the session's model id contains `fable` or `mythos`.
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
