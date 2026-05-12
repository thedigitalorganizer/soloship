# Changelog

## [0.6.0] - 2026-05-12

### Changed (solo-developer defaults)

Two skill defaults flipped to match how solo developers actually ship. Both are backwards-compatible — the previous behavior is still available on explicit request — but the defaults now match the project's name.

- **`/soloship:implement` defaults to creating a worktree, not a bare branch.** A new Step 1.7 in `skills/implement/SKILL.md` overrides the Compound-Engineering "Setup Environment" menu (which presented a worktree as "Option B") and routes new feature work through `/soloship:using-git-worktrees` by default. Falls back to a manual `git worktree add` snippet if the skill isn't available. Skip and use a bare branch only if the user explicitly says so or the change is the trivial 1-2 step exception.
- **`/soloship:implement` no longer auto-creates GitHub PRs at the end of execution.** A new Step 2.5 in `skills/implement/SKILL.md` intercepts the final step of CE's Phase 4 ("Ship It") and replaces `gh pr create` with a local merge into the base branch (checkout base → pull → merge → push base → delete feature branch → remove worktree). PRs only happen when the user explicitly asks for one ("open a PR," "push it up for review") or picks `/soloship:finish` Option 2.
- **`/soloship:shipthorough` Step 10 rewritten.** Was hard-coded "push + `gh pr create`"; now defaults to the same local-merge-and-push flow as `/soloship:implement`. PR creation is preserved behind explicit opt-in. The "Done" report block and verification checklist were updated to match.

### Why

Soloship's audience is solo developers. The PR-and-review pattern is correct for teams; for a solo operator it's pure latency between "done" and "live" — and it trains agents to think the workflow ends at github.com instead of in the working repo. The bare-branch default has a separate failure mode: when Soloship users run 2-5 parallel agent processes against the same repo (which is the project's whole positioning), branches in a single checkout collide on the working tree, and `git status` becomes useless. Worktrees isolate them.

### Migration

Nothing to migrate. The first time you run `/soloship:implement` or `/soloship:shipthorough` after updating, you'll see new behavior at two points:

- At the start of execution, the agent will create a worktree under `.worktrees/<branch-name>` instead of running `git checkout -b` in the current directory. Verify your `.gitignore` contains `.worktrees/`; the worktree skill adds it automatically if missing.
- At the end of execution, the agent will merge the feature branch into your base branch locally and push the base branch instead of opening a PR. If you want a PR for a particular change, say so before the merge step ("open a PR for this") or run `/soloship:finish` and pick Option 2 after the work is done.

If you're working in a team setting where PRs are required, set up a project-local rule that overrides the default, or invoke the explicit PR opt-in on every run.

## [0.5.0] - 2026-05-12

### Changed (breaking)
- **All vendored skill names dropped their source prefix.** `ce-*`, `sp-*`, `gs-*`, `im-*`, and `uiux-*` prefixes are gone. Slash commands are now plain English names: `/soloship:browse` (was `gs-browse`), `/soloship:cso` (was `gs-cso`), `/soloship:code-review` (was `ce-review`), `/soloship:ui-audit` (was `im-audit`), `/soloship:test-driven-development` (was `sp-test-driven-development`), and so on. Source attribution lives in `THIRD_PARTY_NOTICES.md` and the README; users no longer need to know what `ce`/`sp`/`gs`/`im`/`uiux` mean to invoke a skill.
- **Five 1:1 routers merged into the target skill.** `/soloship:debug` now contains the full systematic-debugging methodology inline (was a router to `sp-systematic-debugging`); same pattern for `/soloship:plan`, `/soloship:implement`, `/soloship:learn`, and `/soloship:design-review`. Each merged skill keeps Soloship's preamble (iron-law reminders, solution-search step, common rationalizations) and appends the upstream methodology.
- **Three brainstorming variants folded into `/soloship:brainstorm`.** Compound Engineering's `brainstorm` and `brainstorming` plus Superpowers' `brainstorming` are now sections of one skill; the demand-discovery path (`/soloship:office-hours`) stays separate.
- **Plan-review slash commands renamed for clarity.** `/soloship:gs-plan-ceo-review` → `/soloship:ceo-review`; same pattern for `eng-review`, `devex-review`, and `plan-design-review`. `gs-plan-design-review` kept the `plan-` prefix because `/soloship:design-review` is taken by the visual UI review skill.
- **Net surface:** 51 commands → 43 commands. No source prefixes; no `(Soloship) Soloship —` doubling.

### Why
On a fresh-install Mac mini, slash commands like `/soloship:ce-plan` and `/soloship:gs-browse` leaked implementation detail that no end user has any way to interpret. The source prefix existed for attribution; that need is fully served by the GitHub README and `THIRD_PARTY_NOTICES.md`. For 1:1 routers, the indirection produced ugly double-prefixed names (`/soloship:debug` calling `sp-systematic-debugging`) without adding value over a single merged skill.

### Migration
After updating the plugin (`/plugin update soloship@soloship`), any `/soloship:<old-prefixed-name>` you had muscle-memorized will report "unknown command". Strip the prefix:
- `/soloship:ce-review` → `/soloship:code-review`
- `/soloship:gs-browse` → `/soloship:browse`
- `/soloship:gs-plan-eng-review` → `/soloship:eng-review`
- `/soloship:im-audit` → `/soloship:ui-audit`
- `/soloship:sp-test-driven-development` → `/soloship:test-driven-development`
- Everything else: drop the 2-3 letter prefix and you've got it.

## [0.1.3] - 2026-05-11

### Added
- **`/soloship-finish` slash command.** Surfaces Superpowers' development-branch-completion discipline as a user-facing skill. Use after implementation work is done to walk the merge / PR / cleanup options. Internally the skill is at `skills/finish/`, vendored from Superpowers v4.1.1.

### Fixed
- **Attribution comment added to 4 sp-* skills.** `sp-executing-plans`, `sp-subagent-driven-development`, `sp-using-git-worktrees`, and the renamed `skills/finish/` were missing the standard `<!-- Vendored from superpowers v4.1.1 (Jesse Vincent) -->` header that every other vendored skill carries. These were rescue-added in v0.1.1 and the header got missed. MIT compliance was already satisfied by `skills/vendored/superpowers/LICENSE`; this is the voluntary in-file source clarity we apply elsewhere.
- **Stale counts in vendored-source docs.** `skills/vendored/superpowers/README.md` said "5 skills"; reality is 9. `THIRD_PARTY_NOTICES.md` had the same drift. Both now list all 9 Superpowers skills with the appropriate Soloship rename note for `finishing-a-development-branch` → `finish`.

### Changed
- **`skills/sp-finishing-a-development-branch/` renamed to `skills/finish/`** with `name: finish` in frontmatter. Cross-references in the three sibling sp-* skills that invoke it (`executing-plans`, `subagent-driven-development`, `using-git-worktrees`) updated to use the new slash form `/soloship-finish`.

## [0.1.2] - 2026-05-11

### Fixed
- **gs-browse arch mismatch.** v0.1.1 shipped a pre-compiled arm64 binary for `dist/browse`; Intel Macs failed with `bad CPU type in executable`. Soloship no longer ships pre-compiled launcher binaries — `scripts/build-soloship.sh` compiles for the host architecture on first use (~2 min one-time per machine). Eliminates the entire arch-mismatch class of bugs, including the project-level-install + CPU-upgrade failure mode.
- **`build-soloship.sh` is now genuinely self-sufficient.** Previously it only printed a curl command and errored if bun was missing. Now it installs bun with a SHA-pinned `curl bun.sh/install` (matching upstream gstack's preamble), runs `bun install`, compiles the launcher, builds the Windows fallback, and downloads Playwright Chromium — all in one invocation.
- **bun PATH propagation in non-interactive shells.** Bash tool calls from agents spawn non-interactive shells that skip `~/.zshrc`, so a freshly-installed bun wasn't reachable. SETUP blocks across all 5 browse-aware skills (gs-browse, gs-design-review, gs-qa, gs-office-hours, gs-plan-design-review) and the build script now prepend `~/.bun/bin` to `PATH` explicitly.
- **SETUP block precision.** Previously SETUP could only report `NEEDS_SETUP` (a dead-end signal). It now discovers the skill directory before checking for the binary and returns `NEEDS_SETUP: <path-to-build-script>` so the calling agent can run the exact build command without searching. New `NEEDS_SETUP_NO_DIR` state distinguishes "skill installed but unbuilt" from "Soloship plugin missing entirely."

### Changed
- **Every Soloship skill description now starts with `Soloship — `** (51 SKILL.md files). Makes plugin ownership obvious in the slash-command picker when the user also has gstack, Superpowers, or other source plugins installed. Stripped 11 leftover `(gstack)` attribution parentheticals from descriptions.
- **`skills/gs-browse/dist/` no longer ships compiled binaries.** Only `dist/server-node.mjs` (arch-neutral Windows fallback bundle, ~530KB) and `dist/bun-polyfill.cjs` remain tracked. Plugin clone is ~110MB lighter.

### Added
- **`docs/known-issues/gs-browse.md`** — captures issues surfaced during Phase 5 fresh-machine testing that don't have local fixes yet (snapshot `-i -a -o` multi-element error in the annotate pipeline; daemon's silent-fallback-to-help behavior on unknown commands). All have documented workarounds.
- SKILL.md note clarifying there is no `cookie-clear` command and listing the three real ways to reset session state (`state save/load`, app sign-out, `$B js` with the cookie-clearing one-liner).

## [0.1.1] - 2026-05-11

### Added
- **Vendored gs-browse v1.31.1.0** with Soloship-native paths (`~/.soloship/`, no `GSTACK_HOME` env var, runtime-discovery of install paths). Restored visual QA and screenshot-diff capabilities for Soloship-only users — `/gs-qa`, `/gs-design-review`, `/gs-plan-design-review`, and `/gs-office-hours` work without a separate gstack install. *(Note: v0.1.1's binary was arm64-only; see 0.1.2 for the fix.)*

### Changed
- **Self-containment pass.** Stripped external dependencies on gstack from every vendored skill so Soloship customers don't need to install gstack/Superpowers/CE/Impeccable/ui-ux-pro-max separately. Vendored attribution archive at `skills/vendored/<source>/` preserves licenses + version pins.
- Vendored missing Superpowers skills and the `code-reviewer` agent that earlier skills referenced.

### Fixed
- `prepublishOnly` script now enforces version bump before `npm publish` (prevents accidental duplicate-version publish failures).
- `files` allowlist in `package.json` no longer references a non-existent `templates/` directory.

## [0.1.0] - 2026-04-07

### Added
- npm installer (`npx soloship init`) with stack detection, folder scaffolding, doc generation, hooks, rules, and CI setup
- 16 Claude Code skills: audit, bootstrap, brainstorm, plan, implement, review, debug, learn, shipfast, shipthorough, qa, security, design-review, retro, spec, onboard
- 9 Claude Code hooks: dangerous command blocking, auto-lint, CHANGELOG check, dependency graph, plan validation, workflow navigator, handoff reminder, context injection, architecture fitness
- 4 workflow rules: solution search, plan materialization, plan rationale, plan lifecycle
- GitHub Actions CI template with architecture fitness functions
- Complete design documentation and research archive
