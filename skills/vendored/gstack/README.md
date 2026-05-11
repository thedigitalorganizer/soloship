# Vendored from gstack

**Source:** [gstack](https://github.com/garrytan/gstack) by [Garry Tan](https://x.com/garrytan) (Y Combinator)
**License:** MIT — see `LICENSE` in this directory
**Version pinned:** 1.12.1.0

Thank you, Garry, for building and open-sourcing the toolkit of a solo builder who ships like a team. gstack does a huge amount of the heavy lifting for Soloship — the plan-review trio, the headless browser, the design-review checklist, the security audit, and especially the `autoplan` pipeline that chains four reviews into one command.

## What Soloship vendors from gstack (11 skills)

- `autoplan/` — **the must-have.** Chains CEO, design, eng, and DX reviews into one pass with auto-decisions.
- `checkpoint/` — save/resume working state across `/clear` boundaries (added to gstack 2026-04-17)
- `browse/` — headless browser for QA and dogfooding; replaces chrome-devtools
- `qa/` — systematic QA testing with a bug-fix loop
- `design-review/` — visual audit + AI slop detection
- `plan-ceo-review/` — founder-mode plan review
- `plan-eng-review/` — eng manager architecture review
- `plan-design-review/` — designer's eye plan review (required by `autoplan`)
- `plan-devex-review/` — developer-experience plan review (required by `autoplan`)
- `office-hours/` — YC demand-validation forcing questions
- `cso/` — security audit with OWASP + STRIDE

## What we deliberately did not vendor

Soloship cut 25 gstack skills to keep the non-coder surface small. The most notable cuts:

- **`ship` and `land-and-deploy`** — Soloship already has `/shipfast` and `/shipthorough` that cover the same ground with audience-appropriate flow (one command, no PR-review pause).
- **`health`** — composite 0–10 health scores are useful for senior engineers tuning a codebase; less useful for non-coders who ask "is my app broken?" or "is my code bad?"
- **`investigate`** — overlaps with Superpowers' `systematic-debugging`, which Soloship also vendors.
- **iOS / Swift ecosystem**, **benchmark / benchmark-models**, **make-pdf**, **setup-*** (browser-cookies, gbrain, deploy), **connect-chrome**, **learn** (Soloship has its own), **retro**, **document-release**, **gstack-upgrade**, **codex**, **canary**, **careful / freeze / guard / unfreeze**, **devex-review**, **design-html / design-shotgun / design-consultation**, **open-gstack-browser**.

If any of these sound useful to you, install the full gstack — it has real depth beyond what Soloship vendors.

## What you get by installing the full gstack

Full gstack ships ~35 skills plus its own setup tooling, automation helpers, and the canary monitoring system. Worth installing if you want the whole workshop, not just Soloship's selection.

```bash
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup
```

Full source: https://github.com/garrytan/gstack
