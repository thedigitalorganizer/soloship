# Vendored from Impeccable

**Source:** [Impeccable](https://impeccable.style) by [Paul Bakaus](https://github.com/pbakaus)
**License:** Apache 2.0 — see `LICENSE` and `NOTICE.md` in this directory
**Version pinned:** 1.0.0

Thank you, Paul, for giving design vocabulary and discipline to AI coding tools. Soloship's non-coder users especially benefit from the `frontend-design` skill and the steering commands (`/i-simplify`, `/i-polish`, etc.) — they let someone who isn't a designer produce work that doesn't look AI-generated.

## Attribution chain

Impeccable's `frontend-design` skill builds on Anthropic's original `frontend-design` skill (Apache 2.0). Attribution flows:

**Anthropic → Paul Bakaus → Soloship.**

Full chain preserved in `NOTICE.md` per Apache 2.0 requirements. When Soloship modifies a vendored file, it's marked in the file header with `Modifications by Soloship: <date> — <what changed>`.

## What Soloship vendors from Impeccable (6 skills)

- `frontend-design/` — distinctive, production-grade UI generation (Impeccable's enhancement of Anthropic's original)
- `i-simplify/` — strip designs to their essence
- `i-polish/` — final quality pass before shipping
- `i-clarify/` — improve unclear UX copy, microcopy, labels, error messages
- `i-critique/` — evaluate design effectiveness from a UX perspective
- `i-audit/` — comprehensive accessibility + performance + responsive audit

## What you get by installing the full Impeccable plugin

Impeccable ships **17 steering commands** and **curated anti-patterns** across typography, color-and-contrast, spatial design, motion, interaction, responsive design, and UX writing. Soloship vendors the five most-used steering commands; the other twelve (`/i-bolder`, `/i-quieter`, `/i-normalize`, `/i-extract`, `/i-colorize`, `/i-delight`, `/i-adapt`, `/i-animate`, `/i-harden`, `/i-optimize`, `/i-onboard`, `/i-teach-impeccable`) are available in the full plugin.

```
/plugin marketplace add pbakaus/impeccable
/plugin install impeccable@impeccable
```

Full source: https://impeccable.style
