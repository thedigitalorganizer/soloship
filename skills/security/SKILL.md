---
name: security
description: |
  Security audit using OWASP Top 10 and STRIDE threat modeling.
  Routes to gstack cso for infrastructure-first security scanning.
---

# Soloship Security

Invoke the `cso` skill (gstack). It performs a comprehensive security audit:

- Secrets archaeology (hardcoded keys, leaked credentials)
- Dependency supply chain (npm audit, known CVEs)
- CI/CD pipeline security
- OWASP Top 10 checklist
- STRIDE threat modeling
- Active verification (not just static analysis)

## After the Audit

If critical vulnerabilities are found, suggest `/shipfast` to deploy fixes
immediately. For non-critical findings, suggest `/plan` to address them
systematically.

**Security audit uses `references/security-checklist.md` as its baseline checklist.**

## Verification

Security audit is not complete until ALL of these are true:

- [ ] OWASP Top 10 checked (each item addressed, not just the easy ones)
- [ ] STRIDE threat model completed for the system
- [ ] `npm audit` / `pip-audit` run and output included
- [ ] Secrets scan completed (source files + git history)
- [ ] Findings categorized by severity (Critical/High/Medium/Low)
- [ ] Active verification performed (not just static analysis — tested the claims)
