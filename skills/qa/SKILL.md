---
name: qa
description: |
  Visual QA testing with headless browser. Routes to gstack qa for systematic
  testing, bug finding, and fix verification.
---

# Soloship QA

Invoke the `qa` skill (gstack). It systematically QA tests a web application
using a headless browser — navigates pages, interacts with elements, verifies
state, takes screenshots, and finds bugs.

If the user says "just report bugs" or "don't fix anything," invoke `qa-only`
instead — it produces a structured report without modifying code.

## Before Starting

Ask the user:
1. What URL should I test? (localhost:3000 or production URL)
2. Any specific flows to focus on? (or "test everything")

## After QA

If bugs were found and fixed, suggest `/shipfast` to deploy the fixes.
If the report-only mode was used, suggest `/plan` to address the findings.

**QA uses `references/accessibility-checklist.md` for accessibility verification.**

## Verification

QA is not complete until ALL of these are true:

- [ ] URL confirmed with user before testing
- [ ] Flows tested (user-specified or comprehensive)
- [ ] Screenshots taken as evidence of findings
- [ ] Bugs categorized by severity
- [ ] For fix mode: each fix committed atomically and re-verified
- [ ] For report mode: structured report delivered with repro steps
