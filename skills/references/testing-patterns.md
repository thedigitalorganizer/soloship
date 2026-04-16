# Testing Patterns

Canonical reference for test strategy. Used by `/review`, `/shipthorough`, `/audit`.

## Test Pyramid

```
        /  E2E  \        ~5%   Critical user flows only
       /----------\
      / Integration \    ~15%  Boundary crossing (API, DB, services)
     /----------------\
    /     Unit Tests    \ ~80%  Pure logic, fast, isolated
```

## Five Test Categories

Every feature should have tests across these categories:

| Category | What to test | Example |
|----------|-------------|---------|
| **Happy path** | Normal input, expected flow | User logs in with valid credentials |
| **Empty/null** | Missing or empty inputs | Empty form submission, null user ID |
| **Boundary** | Edge values, limits | Max length string, zero, negative, off-by-one |
| **Error path** | Failures, exceptions | Network timeout, invalid token, 500 response |
| **Concurrency** | Race conditions, ordering | Two users editing same resource simultaneously |

## Patterns to Follow

- **Arrange-Act-Assert** — Three distinct sections, every test
- **DAMP over DRY** — Repeat setup in tests for clarity; shared helpers obscure intent
- **State-based assertions** — Assert on outcomes, not on method calls
- **Independent tests** — No shared mutable state between tests; each test sets up its own world
- **Descriptive names** — `test_expired_token_returns_401` not `test_auth_3`

## Anti-Patterns

- Mocking everything (test proves nothing about real behavior)
- Testing implementation details (breaks on every refactor)
- Asserting on log output or console.log
- Giant integration tests that take minutes and flake
- No assertions (test that "passes" but verifies nothing)

## Coverage Guidance

- New code: aim for 80%+ line coverage on business logic
- Bug fixes: include a regression test that fails without the fix
- Don't chase 100% — diminishing returns on getters, simple wrappers, framework boilerplate
