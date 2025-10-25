# ATDD Checklist - Epic 1, Story 2: Align OAuth + MCP session endpoints

**Date:** 2025-10-24
**Author:** drj
**Primary Test Level:** API

---

## Story Summary

MCP clients must receive OAuth helper responses that align with the ChatGPT MCP schema so integrations no longer require custom parsing or forks. This checklist captures the failing acceptance tests that now guard the required behavior.

**As a** ChatGPT MCP client developer
**I want** Better Auth to emit MCP-compliant token, introspection, session, and handshake payloads
**So that** my MCP apps integrate without bespoke glue code.

---

## Acceptance Criteria

1. `/api/auth/oauth2/token` returns `{ access_token, token_type, expires_in, scope, client_id, resource }` with correct types.
2. `/api/auth/oauth2/introspect` returns MCP schema fields including `client_id`, `resource`, `issued_token_type`, and `active` flag.
3. `/api/auth/mcp/session` returns `{ userId, clientId, scopes, issuedAt, expiresAt, resource }` when session is valid.
4. `/api/auth/mcp/handshake` validates requesting origin against registry and returns OAuth endpoints, consent URL, discovery URLs.

---

## Failing Tests Created (RED Phase)

### API Tests (4 tests)

**File:** `tests/api/mcp-contract.test.mjs` (150 lines)

- ✅ **Test:** `token endpoint returns MCP-compliant payload`
  - **Status:** RED – Better Auth currently proxies the underlying response without injecting `client_id`, `resource`, or `scope`, so assertions for those fields fail.
  - **Verifies:** Acceptance Criterion 1 (token contract)
- ✅ **Test:** `introspection response surface MCP metadata fields`
  - **Status:** RED – Introspection response lacks `client_id`, `resource`, and `issued_token_type` metadata expected by ChatGPT MCP clients.
  - **Verifies:** Acceptance Criterion 2 (introspection contract)
- ✅ **Test:** `session endpoint returns MCP session contract fields`
  - **Status:** RED – Session payload omits `resource`, `issuedAt`, and `expiresAt`, preventing downstream scope validation.
  - **Verifies:** Acceptance Criterion 3 (session helper)
- ✅ **Test:** `handshake response exposes consent and discovery endpoints alongside OAuth metadata`
  - **Status:** RED – Handshake response does not surface `consent` / `discovery` URLs derived from issuer metadata.
  - **Verifies:** Acceptance Criterion 4 (handshake payload)

All tests follow Given-When-Then comments inline, use deterministic network interception via the stub fixture, and currently fail, signalling missing MCP fields in runtime behavior.

---

## Data Factories Created

### MCP Contract Factory Helpers

**File:** `tests/support/factories/mcp.factory.mjs`

Exports:

- `createMcpClient(overrides?)` – Generates registry client definitions (id, origin, resource, redirect URI, scopes).
- `createTokenResponse(overrides?)` – Produces baseline OAuth token payload (intentionally missing MCP fields so tests fail).
- `createIntrospectionResponse(overrides?)` – Produces baseline introspection payload with toggles for MCP metadata.
- `createSessionPayload(overrides?)` – Generates session payload scaffolding (userId, clientId, scopes) without MCP enrichments.
- `createHandshakeMetadata(overrides?)` – Builds OAuth metadata (authorization/introspection/revocation endpoints plus consent/discovery URLs).

Factories rely on `crypto.randomUUID()` for parallel-safe identifiers and accept overrides for scenario-specific tuning.

---

## Fixtures Created

### Express Test App Fixture

**File:** `tests/support/fixtures/app.fixture.mjs`

Fixtures:

- `createAppFixture(options?)`
  - **Setup:** Sets Better Auth environment variables, seeds MCP registry JSON, stubs the Better Auth handler, and instantiates Express via `createApp`.
  - **Provides:** `{ request, authStub }` for SuperTest calls and inspection of stubbed handler invocations.
  - **Cleanup:** Restores original process environment variables after each test.

The fixture composes pure factory data with a fetch-based handler stub, ensuring each test runs in isolation with deterministic responses and no manual teardown.

---

## Mock Requirements

- `Better Auth handler` – Tests use a stubbed `authInstance` that returns minimal OAuth payloads. Real implementation must integrate with Better Auth plugins to emit MCP-compliant fields instead of relying on the stubbed data.
- `MCP registry` – Environment variable `MCP_CLIENTS` is set per test; production must source equivalent data from configuration or persistence.

---

## Required data-testid Attributes

Not applicable – coverage is API-only for this story.

---

## Implementation Checklist (DEV Team)

1. **Token builder:** Augment `/api/auth/oauth2/token` responses to inject `client_id`, `resource`, and granted `scope` (string) before returning to clients.
2. **Introspection contract:** Ensure `/api/auth/oauth2/introspect` returns `client_id`, `resource`, `issued_token_type`, and space-delimited `scope` alongside `active`.
3. **Session payload:** Enrich `/api/auth/mcp/session` with MCP session metadata (`resource`, ISO8601 `issuedAt`, `expiresAt`) while preserving existing fields.
4. **Handshake consent/discovery:** Add `endpoints.consent` and `endpoints.discovery` (derived from issuer metadata) to the handshake API output.
5. **Wire registry resource:** Guarantee all new fields draw from the MCP registry / metadata rather than hard-coded values.
6. **Update contract tests:** Run `pnpm test tests/api/mcp-contract.test.mjs` to verify RED → GREEN transition for each scenario.

Estimated effort to turn the suite green: ~6–8 developer hours given current test harness.

---

## Execution Commands

```bash
pnpm test tests/api/mcp-contract.test.mjs
```

---

## Test Execution Evidence (RED Phase)

Command output excerpt:

```
not ok 1 - token endpoint returns MCP-compliant payload
  token response should include client_id matching requesting client
not ok 2 - introspection response surface MCP metadata fields
  introspection should return client_id for validated token
not ok 3 - session endpoint returns MCP session contract fields
  session payload should include resource identifier
not ok 4 - handshake response exposes consent and discovery endpoints alongside OAuth metadata
  handshake should expose consent endpoint for MCP clients
```

All four tests fail as expected, confirming the suite is exercising the missing MCP contract fields.

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

## Notes

- Tests deliberately keep the stubbed Better Auth responses minimal so new MCP enrichments must be applied in implementation.
- The fixture stubs run entirely in-process; no external services are required to reproduce the RED state.
