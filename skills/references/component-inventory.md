# Component Inventory — the component-reuse contract

<!-- concern:component-reuse (reference — single source of truth for this concern) -->

This is the single source of truth for Soloship's **component-reuse** concern.
Every skill that carries a `<!-- concern:component-reuse -->` marker points
here. Change the protocol in THIS file; never fork the wording at a touchpoint.

## The problem this solves

Agents building UI create duplicate components: a second EmailComposer, a third
Modal. Then one fix lands in one copy and the bug survives in the others.
Soloship's value-level tools (`parameterize-constants`, the Touch Map) don't see
components. This contract makes existing components *visible* so reuse is the
path of least resistance.

## COMPONENTS.md — the inventory

- **Location (target project):** `docs/architecture/COMPONENTS.md`
- **Generated block:** everything between the markers is machine-managed;
  anything outside the markers is the user's and is always preserved:

  ```markdown
  <!-- soloship:components START -->
  | Component | File | Purpose | Props | Used by |
  |---|---|---|---|---|
  | EmailComposer | src/components/EmailComposer.tsx | Compose/send email UI | to, subject, onSend | InboxPage, ContactPanel |
  <!-- soloship:components END -->

  ## Possible duplicates — consolidate?
  (generator appends candidates here; the USER decides, never auto-merge)
  ```

- **Delta-update rule (idempotency):** regeneration compares against the
  existing block and adds/removes/updates **only components whose code
  changed**. Rows for unchanged components — including their prose Purpose —
  are preserved byte-for-byte. Rows sort by component name. A re-run with no
  code changes must produce **no diff**.
- **Ensure the directory exists** (`mkdir -p docs/architecture`) before
  writing. Never write outside the markers except to append the "Possible
  duplicates" section if absent.
- Generators/refreshers: `/soloship:component-inventory` (on demand),
  `/soloship:audit` (Phase 1), `/soloship:learn` (drift check),
  `/soloship:cleanup` (freshness audit), `/soloship:bootstrap` (scaffold).

## The read-before-create protocol

Before creating ANY new UI component:

1. **Look.** If `docs/architecture/COMPONENTS.md` exists, read it. Also
   `git grep -l "<CandidateName\|<SimilarPurposeName" -- '*.tsx' '*.jsx'`.
2. **Cite.** State what you found — "COMPONENTS.md lists EmailComposer
   (src/components/EmailComposer.tsx), used by 3 screens" or "no existing
   component serves this purpose (checked inventory + grep)".
3. **Reuse or extend on purpose-match.** If a component with the same PURPOSE
   exists, extend it (a prop, a variant) instead of copying it.
4. **Blast radius.** When editing a shared component, state it: "imported in
   N places; this change affects all of them" (list them).
5. **Create only after the rule of three** (below), as ONE definition imported
   everywhere it's needed.

## Rule of three — do NOT over-apply this concern

- **Don't abstract on the first or second use.** Extract a shared component
  only when the same markup/behavior appears a THIRD time, or the user
  explicitly asks for reuse.
- **A component taking more than 7 props is a smell** — split it; don't add
  an 8th prop to force one component to serve every context.
- A little duplication is cheaper than the wrong abstraction. (Metz, "The
  Wrong Abstraction"; Dodds, "AHA Programming".)

## Canonical pointer template

Wired skills paste this text at their anchor, immediately after the marker
comment. Keep it word-identical — the concerns fitness test checks the first
line's key phrase:

```markdown
<!-- concern:component-reuse -->
If `docs/architecture/COMPONENTS.md` exists, read it before creating or
specifying UI components — reuse or extend an existing component on purpose
match, cite what you found, and apply the rule of three (see
`references/component-inventory.md`).
```

(Reviewer-flavored touchpoints may append one sentence naming what to flag —
e.g. "Flag any plan/diff that creates a component duplicating an inventoried
one." — but the template lines above stay verbatim.)

## Touchpoint update protocol (the meta-concern)

The manifest `skills/references/concerns.json` lists every skill carrying this
concern's marker; `__arch__/concerns.test.ts` enforces the mapping both ways
plus the template wording. Therefore:

- **Adding a touchpoint** = paste marker + template at the anchor AND add the
  skill to `concerns.json`, same commit.
- **Removing/moving a touchpoint** = update `concerns.json`, same commit.
- **A vendored-skill refresh that wipes a marker** turns `npm test` red — the
  fix is to re-apply the template from this file (cheap: it's copy-paste),
  not to delete the manifest entry.
- **Future cross-cutting concerns** copy this whole shape: one reference file,
  one manifest entry, markers + template, fitness-test protection.
