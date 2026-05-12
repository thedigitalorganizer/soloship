# Third-Party Notices

Soloship ships curated copies of skills from five third-party Claude Code plugins. This file records every source, the version pinned, the license, the author, and where to install the full upstream plugin if any of this looks useful to you.

**Everything here is permissively licensed (MIT or Apache 2.0) and redistributable with attribution.** Soloship doesn't fork these projects — it selects skills that suit non-coder users and credits every source.

## Why a curated selection instead of "install all five plugins"

1. **Overlap and command confusion.** Multiple plugins ship similar commands. For a non-coder, "which one do I run?" is a decision they shouldn't have to make mid-task.
2. **Token savings at session start.** Every registered skill costs tokens on every turn. Curating frees roughly 3–4K tokens per session.
3. **Less decision-making load.** Picking the right tool is high-cost for someone who didn't build any of them. Soloship ships one considered set.
4. **Curated for the non-coder path.** Shawn has used all of these and picked the ones that work best for people who direct agents rather than write code.

If any of these plugins look valuable to you, install the full upstream version — you'll get everything the author built. Each section below has the install command.

---

## Compound Engineering

**Author:** [Kieran Klaassen](https://github.com/kieranklaassen) (Every)
**License:** MIT ([`skills/vendored/ce/LICENSE`](skills/vendored/ce/LICENSE))
**Version pinned:** 2.34.0
**Source:** https://github.com/EveryInc/compound-engineering-plugin

**Vendored into Soloship as:** `/soloship:brainstorm` (merged from `workflows:brainstorm` + `brainstorming`), `/soloship:plan` (from `workflows:plan`), `/soloship:implement` (from `workflows:work`), `/soloship:learn` (from `workflows:compound`), `/soloship:code-review` (from `workflows:review`), `/soloship:document-review`, `/soloship:deepen-plan`. 8 upstream skills consolidated into 7 Soloship commands.

**Install the full plugin for everything else:**
```
/plugin marketplace add EveryInc/compound-engineering-plugin
/plugin install compound-engineering@every-marketplace
```

Thank you, Kieran. The brainstorm → plan → work → compound loop is the backbone of how Soloship thinks about engineering.

---

## Superpowers

**Author:** [Jesse Vincent](https://github.com/obra)
**License:** MIT ([`skills/vendored/superpowers/LICENSE`](skills/vendored/superpowers/LICENSE))
**Version pinned:** 4.1.1
**Source:** https://github.com/obra/superpowers

**Vendored into Soloship as:** `/soloship:debug` (from `systematic-debugging`), `/soloship:test-driven-development`, `/soloship:brainstorm` (merged with CE's brainstorming variants), `/soloship:verification-before-completion`, `/soloship:writing-plans`, `/soloship:executing-plans`, `/soloship:subagent-driven-development`, `/soloship:using-git-worktrees`, `/soloship:finish` (from `finishing-a-development-branch`). 9 upstream skills.

**Install the full plugin for everything else:**
```
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```

Thank you, Jesse. "No fixes without root cause" and "evidence before claims" are the two most important habits Soloship tries to instill in agents working for non-coders.

---

## Impeccable

**Author:** [Paul Bakaus](https://github.com/pbakaus)
**License:** Apache 2.0 ([`skills/vendored/impeccable/LICENSE`](skills/vendored/impeccable/LICENSE), [`skills/vendored/impeccable/NOTICE.md`](skills/vendored/impeccable/NOTICE.md))
**Version pinned:** 1.0.0
**Source:** https://impeccable.style

**Vendored into Soloship as:** `/soloship:frontend-design`, `/soloship:simplify`, `/soloship:polish`, `/soloship:clarify`, `/soloship:critique`, `/soloship:ui-audit` (from `i-audit`). 6 upstream skills.

**Attribution chain:** Impeccable's `frontend-design` extends Anthropic's original `frontend-design` skill (Apache 2.0). Attribution flows Anthropic → Paul Bakaus → Soloship; the full chain is preserved in `NOTICE.md`.

**Install the full plugin for the other 12 steering commands and curated anti-patterns:**
```
/plugin marketplace add pbakaus/impeccable
/plugin install impeccable@impeccable
```

Thank you, Paul. Giving design vocabulary to AI coding tools is exactly what non-coders need to avoid shipping AI-looking work.

---

## ui-ux-pro-max

**Author:** [nextlevelbuilder](https://github.com/nextlevelbuilder)
**License:** MIT ([`skills/vendored/uiux/LICENSE`](skills/vendored/uiux/LICENSE))
**Version pinned:** 2.5.0
**Source:** https://github.com/nextlevelbuilder/ui-ux-pro-max-skill

**Vendored into Soloship as:** `/soloship:ui-ux-pro-max` (1 skill — the top-level reference with style / color / typography / chart / UX guideline lookups).

**Install the full plugin for the full database set:**
```
/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
/plugin install ui-ux-pro-max@ui-ux-pro-max-skill
```

Thank you, nextlevelbuilder. When the agent needs a font pairing or a palette, this is where it goes first.

---

## gstack

**Author:** [Garry Tan](https://x.com/garrytan) (Y Combinator)
**License:** MIT ([`skills/vendored/gstack/LICENSE`](skills/vendored/gstack/LICENSE))
**Version pinned:** 1.31.1.0
**Source:** https://github.com/garrytan/gstack

**Vendored into Soloship as:** `/soloship:autoplan`, `/soloship:browse`, `/soloship:context-save`, `/soloship:context-restore` (the `checkpoint` skill), `/soloship:qa`, `/soloship:design-review` (merged with Soloship's own design-review wrapper), `/soloship:ceo-review` (from `plan-ceo-review`), `/soloship:eng-review` (from `plan-eng-review`), `/soloship:plan-design-review`, `/soloship:devex-review` (from `plan-devex-review`), `/soloship:office-hours`, `/soloship:cso`. 12 upstream skills.

**Install the full plugin for the ~25 other skills we didn't vendor:**
```bash
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup
```

Thank you, Garry. `autoplan` alone is worth the price of admission — chaining four reviews into one command with auto-decisions is exactly the kind of leverage a solo builder needs.

---

## Matt Pocock — Skills (`grill-me`)

**Author:** [Matt Pocock](https://github.com/mattpocock) (AI Hero)
**License:** MIT ([`skills/vendored/pocock/LICENSE`](skills/vendored/pocock/LICENSE))
**Pinned:** see [`skills/vendored/pocock/VERSION`](skills/vendored/pocock/VERSION) (short SHA at adaptation time)
**Source:** https://github.com/mattpocock/skills

**Adapted into Soloship:** `grill-me` (1 skill — substantially rewritten, see below).

The Soloship `grill-me` skill is a Soloship-native rewrite inspired by Pocock's
original. Pocock's verbatim 5-line skill is preserved at
[`skills/vendored/pocock/grill-me-original.md`](skills/vendored/pocock/grill-me-original.md);
the active Soloship version at [`skills/grill-me/SKILL.md`](skills/grill-me/SKILL.md)
adds tier awareness, a six-phase design tree, AskUserQuestion integration, a
rationale-doc artifact output, plain-English voice for non-coders, and a clean
handoff to `/plan` → `/autoplan`.

**Install the full Pocock plugin for everything else (Caveman, TDD, QA, etc.):**
```
/plugin marketplace add mattpocock/skills
```

Thank you, Matt. The "interview before plan" insight — and Brooks' design-concept
framing you cited — is exactly the upstream gap autoplan and ce-plan can't close
on their own.

---

## Modifications

Vendored files are **unmodified copies** of their upstream counterparts unless explicitly marked. Apache 2.0 files (Impeccable) carry modification notes in the file header per the license. MIT files preserve copyright.

**Pocock's `grill-me` is an exception:** the active Soloship `grill-me` skill is a substantial adaptation, not a verbatim copy. The original is preserved unmodified at `skills/vendored/pocock/grill-me-original.md` for reference and license compliance; the adaptation carries an attribution header pointing back to the source.

## License compliance summary

- **MIT sources** (CE, Superpowers, ui-ux-pro-max, gstack): preserve copyright + LICENSE file. Satisfied by per-source `LICENSE` files in each `skills/vendored/<source>/` directory.
- **Apache 2.0 sources** (Impeccable): preserve copyright + LICENSE + NOTICE; mark modifications. Satisfied by per-source `LICENSE` + `NOTICE.md` + header-level modification notes.

## Status of this document

This document is updated as each vendoring phase ships. At any time, it reflects the current state of the `skills/vendored/` tree. If a vendored skill is added, removed, or modified, this file changes too. See [docs/plans/2026-04-24-vendored-skill-manifest.md](docs/plans/2026-04-24-vendored-skill-manifest.md) for the full plan and rationale.
