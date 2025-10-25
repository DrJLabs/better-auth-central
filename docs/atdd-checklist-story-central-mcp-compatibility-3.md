# ATDD Checklist - Epic 1, Story 3: Automate MCP compliance verification

**Date:** 2025-10-24
**Author:** drj
**Primary Test Level:** integration

---

## Story Summary

Scope the MCP compliance workflow so operators can validate every critical endpoint before and after deploy. The CLI must exercise handshake, token, introspection, and session APIs for each registered MCP client, and the documentation needs to stay aligned with the checklist.

**As a** platform operator
**I want** automated MCP compliance verification for dev and production
**So that** I can onboard new MCP servers confidently and catch regressions early

---

## Acceptance Criteria

1. `scripts/mcp-compliance.mjs --base-url=<url>` validates handshake, token, introspection, and session endpoints with Zod schemas.
2. `pnpm mcp:compliance -- --base-url=https://auth.onemainarmy.com` succeeds post-deploy.
3. README and `docs/integration/mcp-auth-checklist.md` explain required env vars, registry config, and compliance workflow.
4. Optional CI hook (documented) demonstrates how to run compliance suite against staging.

---

## Failing Tests Created (RED Phase)

### E2E Tests (0 tests)

No browser-driven flows required for this story; compliance runs via CLI and API contracts.

### API / CLI Integration Tests (2 tests)

**File:** `scripts/__tests__/mcp-compliance.atdd.test.mjs` (303 lines)

- ✅ **Test:** should exercise handshake, token, introspection, and session endpoints
  - **Status:** RED – CLI completes without calling token/introspection/session endpoints; metrics stay at 0
  - **Verifies:** CLI must fetch and validate every MCP contract, not just metadata + session challenge
- ✅ **Test:** should iterate every registered MCP client when performing compliance checks
  - **Status:** RED – CLI only validates the first registry entry; `docs-client` handshake never runs
  - **Verifies:** Every server in `.well-known/mcp-servers.json` must be exercised

### Documentation Guard (1 test)

**File:** `tests/api/mcp-docs.atdd.test.mjs` (47 lines)

- ✅ **Test:** should keep README and integration checklist in sync for MCP environment variables
  - **Status:** RED – README enumerates different env vars/details than the checklist
  - **Verifies:** Operator docs remain a single source of truth across README and dedicated checklist

---

## Data Factories Created

No new factories were required; existing MCP helpers (`tests/support/factories/mcp.factory.mjs`) already provide fixture data for CLI/API tests.

---

## Fixtures Created

No new fixtures were added; existing `tests/support/fixtures/app.fixture.mjs` remains the pattern for API contract coverage but is unused in these CLI-focused red tests.

---

## Mock Requirements

### MCP Compliance CLI Stub Server

- **Endpoint:** `GET /.well-known/mcp-servers.json`
- **Success Response:** JSON array of MCP clients; tests inject multiple clients to assert iteration.
- **Endpoint:** `GET /.well-known/oauth-authorization-server`
- **Success Response:** Metadata with token/introspection endpoints pointing back to the stub.
- **Endpoint:** `GET /api/auth/mcp/handshake`
- **Success Response:** Handshake metadata with per-client scopes/resource.
- **Endpoint:** `POST /oauth2/token`
- **Success Response:** Minimal OAuth token payload; red tests assert CLI fails to call it today.
- **Endpoint:** `POST /oauth2/introspect`
- **Success Response:** Valid payload showing active token; red tests expect CLI to call it.
- **Endpoint:** `GET /api/auth/mcp/session`
- **Failure Response:** `401` with `WWW-Authenticate` challenge to confirm CLI still enforces auth requirement during red phase.

---

## Implementation Checklist (DEV)

1. Update `scripts/mcp-compliance.mjs` to fetch and validate token, introspection, and session payloads using shared Zod schemas.
2. Loop through every entry in `.well-known/mcp-servers.json`, running the full compliance flow per client.
3. Add bounded fetch timeouts + retry/backoff so CLI fails fast on network stalls (cover acceptance criterion 2).
4. Harmonize README and `docs/integration/mcp-auth-checklist.md` environment variable guidance; consider centralizing via snippet or lint.
5. Document CI hook (staging compliance command) and ensure optional workflow references the CLI.

---

## data-testid Requirements

N/A – Story operates at CLI and API levels only; no UI selectors required.

---

## Test Execution Evidence (RED Phase)

**Command:** `pnpm test scripts/__tests__/mcp-compliance.atdd.test.mjs`

```
not ok 1 - should exercise handshake, token, introspection, and session endpoints
  error: Expected compliance CLI to call token endpoint at least once (RED phase expectation)
not ok 2 - should iterate every registered MCP client when performing compliance checks
  error: Expected CLI to run compliance checks for every registered client (RED phase expectation)
```

**Command:** `pnpm test tests/api/mcp-docs.atdd.test.mjs`

```
not ok 1 - should keep README and integration checklist in sync for MCP environment variables
  error: Expected README and MCP integration checklist to enumerate identical environment variable guidance (RED phase expectation)
```

---

## Notes

- CLI-focused tests deliberately instrument HTTP stub servers to capture whether token/introspection/session endpoints are invoked.
- README vs checklist lint currently highlights multiple discrepancies (extra variables, inconsistent descriptions) that need consolidation.

---

## Knowledge Base References Applied

- `fixture-architecture.md`
- `data-factories.md`
- `component-tdd.md`
- `network-first.md`
- `test-quality.md`
- `test-healing-patterns.md`
- `selector-resilience.md`
- `timing-debugging.md`

---

## Next Steps

1. Share this checklist during standup and align on implementation owners for each red test.
2. Run the red suites locally (`pnpm test scripts/__tests__/mcp-compliance.atdd.test.mjs` and `pnpm test tests/api/mcp-docs.atdd.test.mjs`) before coding.
3. Implement the CLI improvements and doc parity updates one test at a time (red → green → refactor).
