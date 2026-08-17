---
title: Check repo visibility before committing client-derived artifacts — evidence carries PII
date: 2026-08-17
producer: soloship-learn
version: 1
ttl_days: 90
content_hash: 8857c375cb5c
problem_type: best_practice
category: best-practices
components: [docs, evidence, gitignore]
files: [.gitignore]
tags: [pii, public-repo, evidence, privacy, reports, gauntlet]
---

# Check repo visibility before committing client-derived artifacts

## The Near-Miss

2026-08-17: a request to "copy the gauntlet report into Soloship" nearly landed
a client's real email address and phone number (quoted verbatim inside the
report's findings) into `docs/reports/` — one of the few TRACKED doc paths in
a repo that is **public on GitHub**. Caught only because repo visibility was
checked (`gh repo view --json isPrivate` → `false`) before choosing the
destination path.

The general shape: **evidence artifacts inherit the data of the system they
evaluated.** A report *about* CRM work quotes CRM rows; QA screenshots capture
customer names and money figures; seeded fixtures copy real records (the
gauntlet's arm-D incident). The artifact then travels — to another repo, a
report dir, a doc site — and the PII travels with it.

## Solution

Before writing any artifact derived from client/production data into a repo:

1. **Check visibility**: `gh repo view <repo> --json isPrivate,visibility`.
2. **Check trackedness of the destination**: `git check-ignore -v <path>` —
   in Soloship, `docs/*` is gitignored EXCEPT `known-issues/`, `solutions/`,
   `reports/`; the tracked exceptions are exactly the dangerous ones.
3. Public repo + tracked path + client-derived content → either a gitignored
   location (`docs/evidence/` in Soloship) or a redaction pass first. State
   which was chosen and why.

In this workspace: the gauntlet report lives at
`Soloship/docs/evidence/2026-08-12-command-center-model-gauntlet.md`,
gitignored on purpose. Never move it to a tracked path without redaction.

## Why This Works

The gitignore allowlist and the repo's visibility are two facts nobody holds
in mind while focused on "preserve this file" — the check takes seconds and is
mechanical. The v2 lean-harness plan carries the systemic version (an evidence
dir that is gitignored by default plus a PII scanner in `verify-finish`); this
doc is the manual floor until that ships.

## Prevention

- Treat "copy this report/artifact somewhere durable" as a data-handling
  decision, not a file operation.
- Soloship's public-surface hygiene rule extends to docs: client identifiers
  never enter tracked paths of the public repo.
