# Publish Version Bump (Auto-Loaded)

## The Rule

Before any `npm publish` to the `soloship` package, bump `package.json` version with `npm version patch|minor|major`. Never publish without bumping — npm will reject a duplicate version, and the `prepublishOnly` script in `package.json` also guards against it.

## How To Pick The Bump Size

Look at what changed since the last published version (`git log v$(node -p "require('./package.json').version")..HEAD`) and pick by impact:

- **patch** (`0.1.0 → 0.1.1`) — bug fixes, doc fixes, internal refactors, hook tweaks that don't change user-facing behavior
- **minor** (`0.1.0 → 0.2.0`) — new skills, new commands, new hooks, new init flags, new vendored sources. Backwards-compatible additions.
- **major** (`0.1.0 → 1.0.0`) — breaking changes: renaming or removing a router skill, changing `bin/soloship.js` entry behavior, removing a CLI flag, removing a vendored skill someone might depend on, changing the hook contract in a way that breaks existing project installs.

State the choice and the reasoning in chat before running the command, so Shawn can override.

## The Publish Sequence

**Mechanical path (use this):** `npm run release -- patch|minor|major`, then
`npm publish`. The release script runs every step below plus the four-file
version sync, and `prepublishOnly` hard-gates the publish on
`scripts/release-preflight.js`. The manual sequence is kept for
understanding, not for running:

```bash
# 1. Make sure working tree is clean and on main with latest
git status
git pull --rebase origin main

# 2. Pick the bump size, then bump. This edits package.json,
#    creates a commit, and tags the new version.
npm version patch    # or minor / major

# 3. Push the bump commit and tag together
git push origin main --follow-tags

# 4. Publish to npm. prepublishOnly will refuse if version
#    already exists on the registry.
npm publish
```

## Why This Exists

Shawn shipped `soloship@0.1.0` to npm on 2026-05-11. From now on, every shipped change needs a version bump or `npm publish` fails. Putting the rule in a checked-in auto-loaded file (instead of gitignored `CLAUDE.md`) means it cascades to every device that pulls the repo.

## How To Apply

- Triggers on any conversation where we're about to `npm publish` Soloship.
- Also triggers in `/soloship:shipthorough` and `/soloship:shipfast` runs that target the npm package (vs. just committing to git).
- If the user says "ship to npm," "publish a new version," "release," or runs `npm publish` directly, this rule kicks in.
- Doesn't trigger for plain `git push` — Soloship's plugin install pulls from GitHub, but the npm CLI is the binary surface, and that's the one that needs version discipline.
