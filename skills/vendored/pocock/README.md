# Adapted from Matt Pocock's `grill-me`

**Source:** [mattpocock/skills](https://github.com/mattpocock/skills) — `grill-me/SKILL.md`
**Author:** [Matt Pocock](https://github.com/mattpocock) (AI Hero)
**License:** MIT — see `LICENSE` in this directory
**Pinned:** see `VERSION` (short SHA of the upstream commit at adaptation time)

Thank you, Matt. The premise — relentless interview, walk every branch of the design tree, refuse to plan until aligned — is exactly the upstream gap that no other Soloship skill closed. This adaptation owes its core idea to your work and to Frederick Brooks' "design concept" framing you cited.

## What's vendored here

- `LICENSE` — Pocock's MIT license, redistributed verbatim
- `VERSION` — short SHA of the upstream commit pinned for this adaptation
- `grill-me-original.md` — Pocock's verbatim 5-line skill, kept for reference and license compliance

## What Soloship does differently

The active skill lives at [`skills/grill-me/SKILL.md`](../../grill-me/SKILL.md) — it's a Soloship-native rewrite, not a verbatim copy. The differences:

| Aspect | Pocock's original | Soloship's adaptation |
|---|---|---|
| Length | 5 lines | ~150 lines, structured |
| Question delivery | Free-form text, one at a time | `AskUserQuestion` for branchy decisions; free-form for narrative |
| Codebase exploration | "Explore instead" (one line) | Explicit Read/Grep step before each question batch |
| Voice | Generic | Plain English first, jargon glossed once (Soloship audience is non-coders) |
| Tier awareness | None | Auto-skips tiny tasks; offers to skip small tasks; full grill on medium+ |
| Artifact output | None | Saves Q&A transcript as a sibling rationale doc the plan file references |
| Alignment gate | Implicit ("until aligned") | Explicit per-phase + final alignment checks via AskUserQuestion |
| Handoff | None | Hands off cleanly to `/plan` (which routes to `ce-plan`) |
| Plan mode | Not addressed | Plan-mode safe (uses AskUserQuestion to satisfy end-of-turn) |
| Design-tree structure | Implicit | Six explicit phases: Premise → Scope → Data → Edge cases → UX → Final scope sweep |

## Why we adapted instead of vendoring verbatim

The original is intentionally minimal — that's a strength for a generic, prompt-driven skill where you want maximum model creativity. Soloship's audience (non-coders directing AI agents) benefits more from explicit structure: tier rules so they don't get grilled on a rename, an artifact output so the rationale survives a `/clear`, and a clean handoff so the workflow chains brainstorm → grill → plan → autoplan → implement → ship.

If you'd rather use Pocock's stock version, install his plugin directly:

```
/plugin marketplace add mattpocock/skills
```

Both work. Soloship's adaptation is opinionated for a specific audience — Pocock's is the right tool for any other audience.

## License compliance

Pocock's MIT license is preserved at `LICENSE` and his copyright is honored. The Soloship adaptation at `skills/grill-me/SKILL.md` carries an attribution header pointing back here.
