---
name: spec
description: |
  Lightweight formal specification with acceptance criteria. For features that
  need explicit success conditions, data models, or API contracts before planning.
---

# Soloship Spec

Your job is to create a formal specification for a feature that needs more rigor
than a brainstorm doc but less overhead than a full planning process.

## When to Use This

- The feature has multiple stakeholders with different expectations
- Success/failure criteria must be explicit and agreed upon
- Data models or API contracts need to be defined before building
- The feature will be tested against specific acceptance criteria

## What to Produce

Write a spec to `docs/plans/YYYY-MM-DD-<feature>-spec.md`.
Start with YAML frontmatter:
```
---
date: YYYY-MM-DD
producer: soloship-spec
version: 1
status: Draft
ttl_days: 14
---
```

Include these sections:

### 1. Problem Statement
One paragraph: what problem does this solve, for whom, and why now?

### 2. Success Criteria
Numbered list of specific, testable conditions. Each criterion should be
verifiable — "user can X" not "the system is good."

### 3. Data Model (if applicable)
TypeScript interfaces, database schemas, or data structures.
Show the shape of the data, not the implementation.

### 4. API Contract (if applicable)
Endpoints, request/response shapes, error codes.
Focus on the interface, not the implementation.

### 5. User Flow
Step-by-step: what does the user do, what do they see at each step?
Include error states and edge cases.

### 6. Out of Scope
Explicitly list what this feature does NOT include. Prevents scope creep.

### 7. Open Questions
Anything unresolved that needs a decision before building.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "We can figure out edge cases during implementation" | Edge cases discovered during implementation become scope creep, rework, or bugs shipped to production. Specs exist to find them early. |
| "The API contract is obvious from the feature description" | "Obvious" contracts have implicit assumptions about error codes, pagination, auth, and rate limits that only become explicit when you write them down. |
| "Data model will emerge naturally from the code" | Emergent data models produce inconsistent naming, missing relationships, and migration nightmares. Decide the shape before you build. |
| "Out of Scope section is unnecessary — we know what we're building" | Without explicit boundaries, every conversation adds "one more thing." Out of Scope is scope defense. |
| "Open Questions can wait" | Unresolved questions become blocked PRs, mid-sprint pivots, and "I thought you meant..." conversations. Surface them now. |

---

## After the Spec

Suggest:
> "Spec complete. Run `/plan` to create an implementation plan from this spec."

## Verification

The spec is not complete until ALL of these are true:

- [ ] Spec file exists at `docs/plans/YYYY-MM-DD-<feature>-spec.md`
- [ ] Problem Statement is one paragraph (not a feature list)
- [ ] Success Criteria are numbered and each is independently testable
- [ ] Data Model section present (or explicitly marked N/A with reason)
- [ ] API Contract section present (or explicitly marked N/A with reason)
- [ ] User Flow includes at least one error state
- [ ] Out of Scope lists at least one thing
- [ ] Open Questions section present (empty is fine if genuinely resolved)
