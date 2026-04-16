# Performance Checklist

Canonical reference for performance reviews. Used by `/review`, `/shipthorough`, `/audit`.

## Database & Queries

- [ ] No N+1 queries (eager load associations, or batch fetch)
- [ ] Queries use indexes (check `EXPLAIN` on slow queries)
- [ ] Large result sets paginated (never `SELECT *` without `LIMIT`)
- [ ] Write-heavy paths use bulk operations where possible

## Network

- [ ] API responses are reasonably sized (no sending 10MB when 10KB suffices)
- [ ] Assets compressed (gzip/brotli)
- [ ] Images optimized (WebP/AVIF, appropriate dimensions, lazy loaded)
- [ ] Fonts subset to used characters, `font-display: swap`

## Frontend

- [ ] Bundle size checked after changes (`npm run build` output)
- [ ] No large libraries imported for small features (e.g., lodash for one function)
- [ ] Lists virtualized if >100 items (react-window, etc.)
- [ ] Heavy computation off the main thread (Web Workers for >16ms tasks)
- [ ] No layout thrashing (batch DOM reads before writes)

## Backend

- [ ] No blocking I/O on hot paths
- [ ] Expensive operations cached (with TTL and invalidation strategy)
- [ ] Timeouts set on all external calls (HTTP, DB, third-party APIs)
- [ ] Rate limiting on public endpoints

## Patterns to Watch

| Pattern | Problem | Fix |
|---------|---------|-----|
| Loop with DB call inside | N+1 query | Batch fetch before loop |
| `JSON.parse` on large payloads in hot path | Blocks event loop | Stream parse or move to worker |
| Unbounded array growth | Memory leak | Cap size or use ring buffer |
| Synchronous file reads at request time | Blocks all requests | Cache at startup or read async |
| No pagination on list endpoints | Response grows forever | Add `limit` + `offset`/cursor |
