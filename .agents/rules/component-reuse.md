# Reuse Components Before Creating Them (Auto-Loaded)

## The Rule

Before creating ANY new UI component, search for an existing one that serves
the same purpose — and cite what you found. One component definition, imported
everywhere, is the line between "fix it once" and "fixed it here, still broken
in the two copies nobody knew about."

The search is checkable, not aspirational:

1. If `docs/architecture/COMPONENTS.md` exists, read it (the component
   inventory: name, file, purpose, props, used-by). Regenerate/refresh it with
   `/soloship:component-inventory`.
2. Grep for candidates: `git grep -n "<LikelyName" -- '*.tsx' '*.jsx'` (and
   the framework's equivalent for .vue/.svelte).
3. State the result out loud: "COMPONENTS.md lists EmailComposer
   (src/components/EmailComposer.tsx), used by 3 screens — extending it" or
   "no existing component serves this purpose (checked inventory + grep) —
   creating one".

If a component with the same PURPOSE exists: extend it (a prop, a variant)
instead of copying it. When editing a shared component, state its blast
radius: "imported in N places; this change affects all of them" — and list
them.

## Rule of Three — do NOT over-apply this rule

- Never abstract on the first or second use. Extract a shared component only
  when the same markup/behavior appears a THIRD time, or the user explicitly
  asks for reuse.
- A component taking more than 7 props is a smell — split it; don't add an
  8th prop to make one component serve every context.
- A little duplication is cheaper than the wrong abstraction. Deleting a
  premature abstraction costs far more than tolerating a second copy until
  the pattern is proven.

## Why

Duplicate components are the component-level version of magic literals: every
copy is a place a fix can miss. The `parameterize-constants` rule covers
values; this rule covers components. A duplicate-component warn hook fires
when a new export collides with an existing component name — treat the
warning as the guardrail working, not noise to dismiss: reuse, extend, or
rename deliberately.

## When This Triggers

- Any task that creates a new component file or a new exported component.
- Any UI feature work, before writing the first new component.
- Any edit to a component that COMPONENTS.md shows is used in more than one
  place (state the blast radius).
