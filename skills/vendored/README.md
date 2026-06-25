# Vendored skills — attribution archive

**This directory is the attribution archive, not the active-skills location.**

Claude Code's plugin loader discovers skills at one level under `skills/` — so active vendored skills live at `skills/<prefixed-name>/SKILL.md` (e.g., `skills/ce-brainstorm/`, `skills/sp-systematic-debugging/`). This `skills/vendored/` directory holds the **LICENSE / NOTICE / VERSION / README files** that those active skills reference.

Every subdirectory here has three things:

- `LICENSE` — the original license from the upstream project (MIT or Apache 2.0). Attribution obligations travel with the file.
- `VERSION` — the **newest** upstream version any skill from this source was copied from. Because Soloship cherry-picks and refreshes skills individually, skills from the same source can sit at different pins; the authoritative pin for a given skill is its own `<!-- Vendored from ... -->` header, not this aggregate file. The sync/drift watcher compares against this to detect upstream changes.
- `README.md` — what we vendored from this source, what we didn't, and a link to install the full upstream plugin.

Individual active skill files (`skills/<prefix>-<name>/SKILL.md`) carry a one-line header pointing back to this archive: `<!-- Vendored from <source> v<version> (<author>). See skills/vendored/<source>/LICENSE. -->`. That's how a reader opening any vendored skill can trace it to its source in one hop.

## Why curate instead of telling users to install all five

Four reasons — the same ones you'll see in the main Soloship README:

1. **Overlap and command confusion.** Multiple plugins ship similar commands. For a non-coder, "which one do I run?" is a decision they shouldn't have to make mid-task.
2. **Token savings at session start.** Every registered skill costs tokens on every turn. Curating frees roughly 3–4K tokens per session.
3. **Less decision-making load.** Picking the right tool is high-cost for someone who didn't build any of them. Soloship ships one considered set.
4. **Curated for the non-coder path.** Shawn has used all of these and picked the ones that work best for people who direct agents rather than write code.

Nothing here is a fork. If any of these skills are useful to you, please install the full upstream plugin — you'll get everything the author built, not just Soloship's selection. Each subdirectory's README links directly to the full install.

## Full attribution

See `THIRD_PARTY_NOTICES.md` at the repo root for the complete source list, version pins, licenses, authors, and install links.

## Modifications

Unless noted otherwise in a file's header, vendored skills are **unmodified copies** of their upstream counterparts. Apache 2.0 files mark modifications explicitly. MIT files preserve copyright and license.
