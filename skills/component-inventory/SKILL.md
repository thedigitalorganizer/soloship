---
name: component-inventory
description: |
  Scans the codebase for UI components (React .tsx/.jsx, Vue .vue, Svelte
  .svelte) and generates docs/architecture/COMPONENTS.md — one inventory of
  every component: name, file, purpose, props, and where it's used — plus a
  "Possible duplicates" section for the user to decide on. Delta-updates an
  existing inventory (never rewrites unchanged rows). Use when the user says
  "inventory components", "what components do we have", "update the component
  inventory", before starting UI work, or when a reuse decision needs data.
---

## Host Compatibility

If you are running this skill in Codex, read `../references/codex-compatibility.md` before following host-specific tool instructions. Claude Code should continue to use the Claude-specific tools and command wrappers described here.

# Soloship Component Inventory

<!-- concern:component-reuse -->
If `docs/architecture/COMPONENTS.md` exists, read it before creating or
specifying UI components — reuse or extend an existing component on purpose
match, cite what you found, and apply the rule of three (see
`references/component-inventory.md`).

You generate and maintain that inventory. The full contract — file format,
marker-delimited block, delta-update rule, canonical pointer template — lives
in `../references/component-inventory.md`. Read it before writing anything.

## Step 1: Discover components

1. Glob for component files across the whole repo (tracked files):
   `git ls-files -- '*.tsx' '*.jsx' '*.vue' '*.svelte'`
   Skip obvious non-components: test files (`*.test.*`, `*.spec.*`,
   `__tests__/`), storybook files (`*.stories.*`), and type-only files.
2. For each file, extract exported component names — PascalCase exports via
   `export function X` / `export const X` (including `memo(`/`forwardRef(`
   wrappers) / `export default function X` / `export default class X`. For
   `.vue`/`.svelte`, the component name is the file basename.
3. For each component, derive:
   - **File**: repo-relative path.
   - **Purpose**: one line inferred from the JSX/template and naming. Plain
     English, what it renders/does — not implementation detail.
   - **Props**: from the TS interface/type or destructured props; names only,
     comma-separated (cap at ~8, then "…").
   - **Used by**: `git grep -l "<Name\b\|import.*Name"` across source files;
     list importer basenames (cap at ~6, then "+N more").

## Step 2: Write the inventory (delta-update — never a blind rewrite)

Target: `docs/architecture/COMPONENTS.md` (`mkdir -p docs/architecture` first).

1. If the file exists, read the current block between
   `<!-- soloship:components START -->` and `<!-- soloship:components END -->`.
2. **Delta-update:** compare discovered components against existing rows.
   - Component unchanged (same file, same exported props surface) → keep its
     row **byte-for-byte**, including its Purpose prose. Do not re-word.
   - New component → add its row.
   - Deleted component → remove its row.
   - Changed component (moved file / props changed) → update only the changed
     cells; keep the Purpose prose unless the component's job actually changed.
3. Rows sort by component name. Content outside the markers is the user's —
   preserve it untouched.
4. A re-run with no code changes must produce no diff. That property is what
   makes the inventory trustworthy; if your run would re-word unchanged rows,
   you are doing it wrong.

## Step 3: Flag possible duplicates (propose — never auto-merge)

Under a `## Possible duplicates — consolidate?` heading after the block, list
candidate pairs the user should look at:

- **Name similarity**: EmailBox vs EmailComposer vs MessageComposer.
- **Prop-shape similarity**: two components whose prop lists overlap heavily
  (≥ ~70%) and whose purposes read the same.
- For each pair: both files, one line on why they look duplicated, and the
  concrete consolidation option ("extend X with a `variant` prop; delete Y").

Do NOT consolidate anything yourself. The user decides; consolidation work
routes through `/soloship:plan` → `/soloship:implement`. Remember the rule of
three from the contract: two similar components may be legitimately separate —
flag, don't judge.

## Step 4: Report

Tell the user: components found (count), rows added/removed/updated this run
(zero-change runs say "no drift"), and the duplicate candidates (if any) as
the decision list.

## Common misreads

- "I'll just regenerate the whole table — it's cleaner" → a full rewrite re-words unchanged Purpose prose, destroys the no-diff idempotency property, and makes every run look like drift. Delta-update only.
- "These two components are obviously the same — I'll merge them" → consolidation is a code change with blast radius. You propose; the user decides; /implement executes.
- "This project has no docs/architecture dir, skip it" → `mkdir -p docs/architecture` is one command. The inventory is the data source every reuse checkpoint depends on.
- "The inventory is stale, so it's useless" → stale is one run away from fresh — that's this skill's job. Run the delta-update.

## Verification

- [ ] `docs/architecture/COMPONENTS.md` exists with the marker-delimited block
- [ ] Re-running immediately produces no diff (`git diff --stat` clean on the file, or byte-identical content)
- [ ] Every row's file path exists in the repo
- [ ] Possible-duplicates section present (may be empty) and proposes, never merges
