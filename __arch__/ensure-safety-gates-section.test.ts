// Phase 5 fix (found via the real-world MAPS QA test in
// docs/plans/2026-08-27-one-source-of-truth-across-agent-hosts.md): Phase 2
// deleted the generated rule-mirror directories on `upgrade`, but `upgrade`
// preserves AGENTS.md by contract and never regenerates it — so an existing
// project's AGENTS.md never actually gained the Safety gates section the
// mirrors were supposedly replaced by. ensureSafetyGatesSection is the
// mechanical (not judgment) fix: a marker-delimited find-and-replace that
// never touches anything else in the file.

import { describe, it, expect } from "vitest";
import {
  ensureSafetyGatesSection,
  renderSafetyGatesSection,
  SAFETY_GATES_MARKER_START,
  SAFETY_GATES_MARKER_END,
} from "../src/safety-gates";

describe("ensureSafetyGatesSection", () => {
  it("appends the section when the file has neither markers nor a legacy heading", () => {
    const before = "# My Project\n\nSome user-authored prose here.\n";
    const { content, changed } = ensureSafetyGatesSection(before);

    expect(changed).toBe(true);
    expect(content.startsWith(before.trimEnd())).toBe(true);
    expect(content).toContain(SAFETY_GATES_MARKER_START);
    expect(content).toContain(SAFETY_GATES_MARKER_END);
    expect(content).toContain("## Safety gates");
    expect(content).toContain("Billing / Credit / Rerun-Window Confirmation Gate");
  });

  it("appends cleanly to an empty file", () => {
    const { content, changed } = ensureSafetyGatesSection("");
    expect(changed).toBe(true);
    expect(content.startsWith(SAFETY_GATES_MARKER_START)).toBe(true);
  });

  it("replaces stale content between existing markers, leaving surrounding prose untouched", () => {
    const before = `# My Project

Above the section — user content.

${SAFETY_GATES_MARKER_START}
## Safety gates

STALE TEXT FROM AN OLDER SOLOSHIP VERSION
${SAFETY_GATES_MARKER_END}

Below the section — more user content.
`;
    const { content, changed } = ensureSafetyGatesSection(before);

    expect(changed).toBe(true);
    expect(content).toContain("Above the section — user content.");
    expect(content).toContain("Below the section — more user content.");
    expect(content).not.toContain("STALE TEXT FROM AN OLDER SOLOSHIP VERSION");
    expect(content).toContain("Billing / Credit / Rerun-Window Confirmation Gate");
  });

  it("is idempotent — running twice on already-current content changes nothing further", () => {
    const before = "# My Project\n\nUser prose.\n";
    const first = ensureSafetyGatesSection(before);
    const second = ensureSafetyGatesSection(first.content);

    expect(second.changed).toBe(false);
    expect(second.content).toBe(first.content);
  });

  it("upgrades a legacy unmarked '## Safety gates' heading (pre-marker shape) to the marked form", () => {
    const before = `# My Project

Above.

## Safety gates

some old unmarked rendering of the rules here

## Conventions

Below, a different section that must survive.
`;
    const { content, changed } = ensureSafetyGatesSection(before);

    expect(changed).toBe(true);
    expect(content).toContain(SAFETY_GATES_MARKER_START);
    expect(content).toContain("Above.");
    expect(content).toContain("## Conventions");
    expect(content).toContain("Below, a different section that must survive.");
    expect(content).not.toContain("some old unmarked rendering of the rules here");
  });

  it("legacy heading at end of file (no following ## section) is replaced cleanly", () => {
    const before = `# My Project

Above.

## Safety gates

old text, nothing after it
`;
    const { content } = ensureSafetyGatesSection(before);
    expect(content).toContain("Above.");
    expect(content).not.toContain("old text, nothing after it");
    expect(content.trimEnd().endsWith(SAFETY_GATES_MARKER_END)).toBe(true);
  });

  it("renderSafetyGatesSection() output is exactly what gets inserted between the markers", () => {
    const { content } = ensureSafetyGatesSection("");
    expect(content.trim()).toBe(renderSafetyGatesSection().trim());
  });
});
