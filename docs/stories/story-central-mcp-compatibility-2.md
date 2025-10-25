# Story: Align OAuth + MCP session endpoints

Status: Done

## Story

As a ChatGPT MCP client developer,
I want the Better Auth central server to return MCP-compliant payloads for token, introspection, and session helpers,
so my apps integrate without custom parsers or patches.

## Acceptance Criteria

- [x] `/api/auth/oauth2/token` returns `{ access_token, token_type, expires_in, scope, client_id, resource }` with correct types.
- [x] `/api/auth/oauth2/introspect` returns MCP schema fields including `client_id`, `resource`, `issued_token_type`, and `active` flag.
- [x] `/api/auth/mcp/session` returns `{ userId, clientId, scopes, issuedAt, expiresAt, resource }` when session is valid.
- [x] `/api/auth/mcp/handshake` validates requesting origin against registry and returns OAuth endpoints, consent URL, discovery URLs.

## Tasks / Subtasks

- [x] Refactor `src/routes/oauthRouter.ts` to use shared response builders.
- [x] Add `src/routes/mcpRouter.ts` for handshake/session endpoints.
- [x] Update `src/auth.ts` to negotiate scopes and inject MCP metadata.
- [x] Create `src/mcp/schemas.ts` with Zod contracts for responses.
- [x] Write contract tests in `src/__tests__/mcp-compliance.test.mjs`.
- [x] Ensure denied origins and scope mismatches emit structured logs.
- [x] Add story-aligned IDs, priority markers, and GWT scaffolding to `src/__tests__/mcp-compliance.test.mjs` per TEA review.
- [x] Extract reusable MCP registry/session fixtures and data factories for test setup and apply to compliance suite.

### Review Follow-ups (AI)
- [x] [AI-Review][High] Normalize forwarded scope list before token issuance so Better Auth never mints access tokens with unregistered scopes (`src/routes/oauthRouter.ts`)

## Dev Notes

### Technical Summary

Normalize OAuth2 and MCP helper endpoints to match ChatGPT MCP schema, reusing the registry for origin/scope validation and ensuring contract tests guard regressions.

### QA Feedback (2025-10-27)

- TEA review (`docs/test-review.md`) flagged missing story-aligned test IDs/priority metadata and inline MCP fixtures in `src/__tests__/mcp-compliance.test.mjs` (score 75/100, B).
- Follow-up tasks added for BDD/ID scaffolding and reusable fixture/data factory extraction to unblock selective testing and future coverage growth.

### Project Structure Notes

- Files touched: `src/routes/httpUtils.ts`, `src/routes/oauthRouter.ts`, `src/routes/mcpRouter.ts`, `src/auth.ts`, `src/mcp/schemas.ts`, `src/mcp/responses.ts`
- Tests: `src/__tests__/mcp-compliance.test.mjs`

### Estimated Effort

- Story Points: 5
- Time: ~3-4 developer days

### References

- `docs/tech-spec.md`
- MCP auth expectations in ChatGPT developer docs

## Dev Agent Record

### Context Reference

- docs/stories/story-context-central-mcp-compatibility.2.xml

### Debug Log

- Introduced shared HTTP adapters (`src/routes/httpUtils.ts`) and split OAuth/MCP traffic into dedicated routers with structured logging for origin and scope failures (`src/routes/oauthRouter.ts`, `src/routes/mcpRouter.ts`).
- Added MCP response schemas and builders to enforce token, introspection, session, and handshake contracts (`src/mcp/schemas.ts`, `src/mcp/responses.ts`).
- Exposed MCP config accessors and refreshed registry wiring in Better Auth bootstrap (`src/auth.ts`), and mounted the new routers inside the Express app (`src/server.ts`).
- Authored node:test coverage for MCP compliance contracts and updated discovery tests to assert new metadata fields (`src/__tests__/mcp-compliance.test.mjs`, `src/__tests__/server.test.mjs`).
- 2025-10-24 (Amelia): Completed P0 metadata scaffolding for MCP compliance tests (IDs, priority tags, Given/When/Then comments) and refactored test setup using reusable registry/session factories plus an app harness helper before rerunning the full test suite.
- 2025-10-28 (Amelia): Sanitized OAuth token proxy scope forwarding and added enforcement-relaxed regression coverage.

### Completion Notes List

- `pnpm build`
- `pnpm test -- src/__tests__/mcp-compliance.test.mjs`
- `node --test src/__tests__/mcp-compliance.test.mjs`
- `pnpm test`

### Completion Notes

**Completed:** 2025-10-28  
**Definition of Done:** All acceptance criteria satisfied, senior review approved, and both targeted and full regression suites passing after scope sanitization fix.

### Change Log

- 2025-10-24: Implemented MCP-compliant OAuth/session routers, schema builders, and compliance tests; story prepared for review.
- 2025-10-24: Added story-aligned MCP compliance test metadata and reusable registry/session fixtures; refreshed harness helpers.
- 2025-10-28: Senior Developer Review notes appended; scope sanitization follow-up requested.
- 2025-10-28: Sanitized scope forwarding in OAuth token proxy and added regression coverage for enforcement-relaxed flows.
- 2025-10-28: Senior Developer Review approved after verifying scope sanitization fix and regression coverage.

### File List

- `docs/sprint-status.yaml`
- `docs/backlog.md`
- `docs/tech-spec.md`
- `docs/stories/story-central-mcp-compatibility-2.md`
- `src/routes/oauthRouter.ts`
- `src/__tests__/mcp-compliance.test.mjs`

## Senior Developer Review (AI)

- **Reviewer:** drj (AI)
- **Date:** 2025-10-28
- **Outcome:** Approved

### Summary

Scope sanitization now happens inside the OAuth token proxy before the request is forwarded to Better Auth, and the new regression test covers the enforcement-relaxed path. MCP contract responses remain fully compliant and the follow-up is closed.

### Key Findings

- **OK:** `/api/auth/oauth2/token` rewrites the posted form body with the negotiated scope set, preventing unregistered scopes from reaching Better Auth (`src/routes/oauthRouter.ts:173-195`).
- **OK:** Regression `1.2-API-007` exercises enforcement-disabled negotiation and inspects the forwarded payload to guarantee scopes are sanitized (`src/__tests__/mcp-compliance.test.mjs:129-166`).

### Acceptance Criteria Coverage

- **AC1 – Token payload:** ✅ Sanitized forwarding ensures minted tokens reflect registered scopes even when enforcement is relaxed.
- **AC2 – Introspection metadata:** ✅ No regressions; session metadata still populates the MCP fields.
- **AC3 – Session helper:** ✅ Continues to return resource, scope list, and timestamps with deterministic 401 handling.
- **AC4 – Handshake metadata:** ✅ Origin validation and enriched discovery endpoints remain intact.

### Test Coverage and Gaps

- Passes `pnpm test -- src/__tests__/mcp-compliance.test.mjs` and the full `pnpm test` suite, including discovery smoke checks.
- Regression `1.2-API-007` guards the previously identified bug; no additional gaps noted.

### Architectural Alignment

- Changes confine themselves to the router adapter layer, reuse existing helpers, and respect the registry-driven scope catalogue.
- Documentation updates (`docs/backlog.md`, `docs/tech-spec.md`) keep operational guidance in sync.

### Security Notes

- Sanitized forwarding eliminates the scope-escalation risk when operators relax enforcement. Logging still records rejected scopes for observability.

### Best-Practices and References

- [docs/tech-spec.md](../tech-spec.md) – Post-Review Follow-ups now marked resolved.
- [docs/test-design-epic-1.md](../test-design-epic-1.md) – Confirms P0 risk mitigated by regression `1.2-API-007`.
- [docs/architecture.md](../architecture.md) – Express/Better Auth layering remains unchanged.

### Action Items

- None.
