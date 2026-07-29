# QA Test-Account Standard

The contract for `docs/testing/test-accounts.md` in every Soloship project.
When a QA flow needs a login and no test account is documented, this is the
standard to build to (with the user's go-ahead, per the browser-qa-gate rule).
Pattern proven in production on MAPS (`docs/qa/test-accounts.md` there).

## The five requirements

1. **One account per role / permission level the app has** — admin, member,
   viewer, coach, org owner, whatever the app's actual role matrix is. QA as
   the role the flow serves, not just as whichever account happens to exist.
   A fixture defined by an *absence* (a pending invite, an unclaimed seat, an
   un-onboarded signup) is also an account-type row.

2. **Plus-alias emails routed to ONE inbox.** All test accounts are
   plus-aliases of a single service/QA address: `qa+admin@<domain>`,
   `qa+member@<domain>`, … Every email the app sends to any test account
   (invite, password reset, receipt, notification) lands in that one inbox —
   so **email flows are verifiable evidence, not assumed side effects**. The
   doc must record which inbox that is and how QA reads it (mail tool, MCP,
   or asking the user to check). A QA Plan row for an email-sending flow
   means opening that inbox and seeing the email — subject, recipient, links
   that work.

3. **A dedicated QA tenant.** Test accounts live in their own org/workspace/
   team ("<Project> QA Org") so QA never touches real customer data. If the
   app has no tenancy, isolate by naming convention and note it.

4. **Secrets never in the repo.** The doc records emails, roles, purposes,
   and environment; the actual passwords live in a gitignored file
   (`.ai/test-credentials.json` or the project's secret store). One shared
   password across the set is fine — these are non-production, disposable
   credentials.

5. **Idempotent provisioning with self-healing fixtures.** A re-runnable
   script (or documented reset procedure) creates/refreshes the whole set —
   running it twice updates, never duplicates. Fixtures defined by absence
   must be torn back down to their pristine state on every run (an invite
   that QA claimed gets un-claimed), otherwise QA leftovers surface as
   real-looking data. Guard: refuse to delete an account that has real work
   under it; warn instead.

## Doc template

```markdown
# QA Test Accounts

All accounts live in <QA tenant name>; emails are plus-aliases of
<service inbox> — check that inbox to verify email flows (how: <method>).

| Type | Email | What it's for |
|---|---|---|
| <role> | qa+<role>@<domain> | <the flows this account exercises> |

**Default for QA:** <which account>, unless the task names another.
**Credentials:** <gitignored file / secret store> — never committed.
**Provision/refresh:** `<command>` (idempotent; self-heals absence fixtures).
**Verified working:** <date> — <what was checked>; known benign issues: <list>.
```

## Keeping it honest

- Re-verify the set works in-browser whenever QA hits an auth failure, and
  update the "Verified working" line — a test-accounts doc that lies costs
  more than none.
- New scenario (2FA, new role, new plan tier) → extend the provisioning
  script first, then the doc, in the same change.
