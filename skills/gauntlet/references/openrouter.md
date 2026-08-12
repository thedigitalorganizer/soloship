# OpenRouter — what it fixes, and the trap that voids the results

OpenRouter is one API key and one bill for models from every vendor. For a
gauntlet it solves a real problem and creates a subtle one. Both are worth
understanding before wiring it in.

## What question is it for?

The gauntlet answers two different questions, and OpenRouter is only relevant
to one:

| Question | Setup | OpenRouter? |
|---|---|---|
| **Does the Soloship harness earn its keep?** | Claude Code, harnessed vs bare, same model both sides | **No.** The harness is a Claude Code plugin. Nothing to gain. |
| **Which model is best? How do GPT and Grok compare on speed and cost?** | Every model through ONE neutral agent harness | **Yes.** This is what it is for. |

## What it fixes

Without OpenRouter, a cross-vendor comparison has to run Claude models through
Claude Code, GPT through Codex, and Grok through something else. That is not a
model comparison — it is a **model+harness** comparison, and Harness-Bench
found the harness alone can move results 10–20 points. Any ranking produced
that way is uninterpretable: you cannot tell whether Grok lost because Grok is
worse or because its CLI is.

Running every model through one agent harness pointed at OpenRouter holds the
harness constant, which is the only honest way to ask "which model is better".
It also restores the cost and token columns that the `generic` adapter has to
report as `n/a`, because OpenRouter reports usage in one normalized shape for
every vendor.

So the clean design is **two gauntlets on the same course and baseline**:

1. **The harness gauntlet** — Claude Code, harnessed vs bare. Answers the
   Soloship question.
2. **The model gauntlet** — one neutral harness via OpenRouter, every model,
   `bare` only. Answers the model and speed question.

Compare the scorecards. Do not merge them into one table: the arms are not
drawn from the same experiment, and a single ranking across both would imply a
comparison neither gauntlet made.

## The trap: provider routing will void your results

**This is the part that silently ruins a benchmark.** On OpenRouter a model
slug is not a fixed thing. The same slug can be served by different providers,
at different quantizations, with different context windows and output caps, on
different inference engines — and it can change between one request and the
next. Some providers serve heavily quantized variants that measurably
underperform the same model hosted elsewhere.

Run a gauntlet without pinning and you are not measuring models. You are
measuring which backend the router happened to pick for each arm, which is
exactly the kind of confound that makes a confident number worthless. This is
well documented — OpenRouter's own
[routing docs](https://openrouter.ai/blog/insights/model-routing/) describe the
controls, and
["Not Pinning Your OpenRouter Provider Might Invalidate Your Research"](https://www.lesswrong.com/posts/KsyoSAyBRXtwzSugg/not-pinning-your-openrouter-provider-might-invalidate-your)
walks through the failure.

**Pin every model, every run:**

```jsonc
{
  "provider": {
    "only": ["anthropic"],        // allow-list of provider slugs
    "allow_fallbacks": false,     // hard stop — no silent substitution
    "quantizations": ["fp16"]     // refuse over-quantized endpoints
  }
}
```

`allow_fallbacks: false` is the non-negotiable one. Without it, a rate-limited
provider silently hands your arm to a different backend mid-run and nothing in
the output says so.

Record the pinned provider for each model in your writeup. "Grok via xAI direct,
fp16, fallbacks off" is a reproducible claim; "Grok via OpenRouter" is not.

The gauntlet emits a warning at `init` and `run` if it sees an OpenRouter-shaped
adapter with no pinning marker. It is a warning rather than a hard gate because
pinning can also be configured account-side or through a preset that the CLI
never mentions — but if you see that warning and have not pinned somewhere,
stop and fix it before spending the budget.

## The other caveat: the gateway is in your latency

OpenRouter adds a network hop. That is fine for relative comparison **as long
as every arm pays it**. It is misleading the moment some arms go direct and
others go through the gateway — the direct arms will look faster for a reason
that has nothing to do with the model.

Rule: within one gauntlet, either every arm routes through OpenRouter or none
does. Never mix. This is the main reason the two-gauntlet split above is a
design requirement and not just tidiness.

## Choosing the neutral harness

OpenRouter serves models, not agents. Something still has to run the loop —
read files, edit them, run tests, iterate. Agents that are provider-agnostic
and support OpenRouter include
[OpenCode](https://github.com/bradAGI/awesome-cli-coding-agents), Aider, Cline,
and Goose; OpenHands is built for unattended autonomous runs.

Pick on three criteria, in this order:

1. **Non-interactive.** It must accept a prompt and run to completion without a
   TTY. If it needs a human keystroke, it cannot be an arm.
2. **Writes to its working directory.** The gauntlet gives each arm a worktree
   and reads back whatever changed.
3. **Reports usage.** Nice to have — OpenRouter reports cost anyway, and
   wall-clock is always available.

Whichever you choose, **use the same one for every model in that gauntlet.**
The whole point is holding the harness constant.

## Adapter template

```jsonc
"adapters": {
  "openrouter": {
    "id": "openrouter",
    "command": "opencode",
    "baseArgs": ["run", "--model", "{{model}}", "{{prompt}}"],
    "harnessedArgs": [],
    "bareArgs": [],
    "env": {
      "OPENROUTER_API_KEY": "",
      "OPENROUTER_PROVIDER_ORDER": "anthropic",
      "OPENROUTER_ALLOW_FALLBACKS": "false"
    },
    "telemetry": "none"
  }
}
```

```jsonc
"models": [
  { "id": "or-opus5",  "adapter": "openrouter", "model": "anthropic/claude-opus-5",
    "label": "Opus 5 (OR)",  "conditions": ["bare"] },
  { "id": "or-gpt",    "adapter": "openrouter", "model": "openai/gpt-5.4",
    "label": "GPT-5.4 (OR)", "conditions": ["bare"] },
  { "id": "or-grok",   "adapter": "openrouter", "model": "x-ai/grok-code-fast",
    "label": "Grok Code Fast (OR)", "conditions": ["bare"] }
]
```

The exact flag and env-var names depend on the agent you pick — check its docs
rather than trusting this template verbatim. `conditions: ["bare"]` is correct
for all of them: Soloship is not loaded in a third-party harness, so labelling
any of these `harnessed` would put a false row in the table.

## Before spending a run

The single-arm smoke test from `adapters.md` matters more here than anywhere
else, because a misconfigured gateway produces arms that fail identically and
look like a model result:

1. Run the agent by hand in a scratch directory with a trivial prompt and
   confirm it edits a file.
2. Run one arm with `--reps 1 --only <arm-id>`.
3. Check `.gauntlet/<run>/logs/<arm>.stderr.log`. An arm that finishes in under
   two seconds with nothing changed never launched.
4. Confirm in your OpenRouter activity log that the request went to the
   provider you pinned.

Step 4 is the one people skip, and it is the one that catches the trap.
