# Security Checklist

Canonical reference for security reviews. Used by `/security`, `/review`, `/audit`.

## OWASP Top 10 Basics

- [ ] **Injection** — All user input parameterized (SQL, NoSQL, OS commands, LDAP)
- [ ] **Broken Auth** — Sessions expire, tokens rotate, passwords hashed (bcrypt/argon2)
- [ ] **Sensitive Data** — Secrets in env vars (never source), HTTPS enforced, no sensitive data in logs
- [ ] **XXE** — XML parsing disabled or restricted (if applicable)
- [ ] **Broken Access Control** — Every endpoint checks authorization, not just authentication
- [ ] **Misconfig** — Default credentials removed, error pages don't leak stack traces
- [ ] **XSS** — User content escaped before rendering, CSP headers set
- [ ] **Insecure Deserialization** — No untrusted data deserialized into objects
- [ ] **Known Vulnerabilities** — `npm audit` / `pip-audit` clean, no critical CVEs
- [ ] **Logging** — Auth failures logged, no secrets in logs, log injection prevented

## Secrets

- [ ] No hardcoded API keys, passwords, or tokens in source
- [ ] `.env` in `.gitignore`
- [ ] `.env.example` exists with dummy values
- [ ] Git history clean of leaked secrets (or rotated if found)

## Dependencies

- [ ] `npm audit` / `pip-audit` run, critical/high fixed
- [ ] No unnecessary dependencies (smaller surface = fewer CVEs)
- [ ] Lock file committed (`package-lock.json`, `poetry.lock`)

## STRIDE Quick Check

| Threat | Question |
|--------|----------|
| **S**poofing | Can someone pretend to be another user/service? |
| **T**ampering | Can data be modified in transit or at rest without detection? |
| **R**epudiation | Can a user deny performing an action? Are actions logged? |
| **I**nformation Disclosure | Can an attacker see data they shouldn't? |
| **D**enial of Service | Can an attacker make the system unavailable? |
| **E**levation of Privilege | Can a normal user gain admin access? |
