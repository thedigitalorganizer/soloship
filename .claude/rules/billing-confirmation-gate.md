# Billing / Credit / Rerun-Window Confirmation Gate (Auto-Loaded)

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

Then write a one-line note to `.ai/.billing-ack` describing what was confirmed
and the date. The PreToolUse hook blocks matching edits until that file exists.
Creating the ack without actually confirming violates this rule.
