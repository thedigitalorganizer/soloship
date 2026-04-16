# Code Review Axes

Canonical 5-axis review framework. Used by `/review`, `/shipthorough`.

## The Five Axes

### 1. Correctness
Does the code do what it claims to do?
- Fulfills the spec or plan requirements
- Edge cases handled (null, empty, boundary values, overflow)
- Error paths return/throw correctly
- State transitions are complete (no orphaned states)

### 2. Readability
Can someone unfamiliar understand this in one pass?
- Names reveal intent (no `data`, `temp`, `result`, `handler`)
- Control flow is linear where possible (early returns > deep nesting)
- Functions do one thing
- No clever tricks that require comments to explain

### 3. Architecture
Does this fit the system's design?
- Respects module boundaries (no reaching into other modules' internals)
- Dependencies flow in the right direction
- New abstractions earn their keep (used in 3+ places, or hiding real complexity)
- Doesn't introduce circular dependencies

### 4. Security
Is this safe for production?
- User input validated at system boundaries
- No SQL/NoSQL injection vectors
- Auth/authz checked on new endpoints
- Secrets not hardcoded or logged
- See `references/security-checklist.md` for full list

### 5. Performance
Will this hold up under load?
- No N+1 queries
- No unbounded operations (pagination on lists, limits on loops)
- No blocking operations on hot paths
- Heavy work is async where appropriate
- See `references/performance-checklist.md` for full list

## Severity Classification

| Level | Meaning | Action |
|-------|---------|--------|
| **Critical** | Security vulnerability, data loss risk, crash in prod | Must fix before merge |
| **Important** | Missing tests, architectural violation, broken contract | Should fix before merge |
| **Suggestion** | Naming, style, minor refactor opportunity | Optional, author's call |

Use this classification in all review output. Critical and Important findings block ship.
