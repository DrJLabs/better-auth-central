# Story: Establish MCP registry and metadata

Status: Done

## Story

As a platform operator,
I want the Better Auth central server to publish a canonical registry of MCP servers and expose discovery metadata,
so ChatGPT apps can discover handshake and session endpoints without custom configuration.

## Acceptance Criteria

- [x] `src/mcp/registry.ts` stores MCP client entries with `id`, `origin`, `scopes`, `resource`, and `redirectUri`, validated via Zod schema.
- [x] `/.well-known/mcp-servers.json` lists all registered MCP servers with handshake and session URLs.
- [x] `/.well-known/openid-configuration` includes MCP extensions (`mcp_session_endpoint`, `mcp_handshake_endpoint`, `mcp_scopes_supported`).
- [x] Updating the registry (config or runtime) refreshes discovery metadata without restarting the server.

## Tasks / Subtasks

- [x] Implement `src/config/mcp.ts` for registry schema + env parsing.
- [x] Create `src/mcp/registry.ts` with load/save helpers backed by Better Auth storage.
- [x] Implement `src/mcp/metadataBuilder.ts` that generates `.well-known` payloads.
- [x] Update `src/server.ts` to serve new endpoints and wire origin resolver.
- [x] Write `docs/integration/mcp-auth-checklist.md` covering registry setup.
- [x] Add integration tests verifying metadata payloads and auto-refresh behaviour.

## Dev Notes

### Technical Summary

Introduce typed MCP registry module, derive `.well-known` documents, and keep metadata in sync with runtime config so MCP clients can self-configure.

### Project Structure Notes

- New directories: `src/mcp/`
- Key files: `src/config/mcp.ts`, `src/mcp/registry.ts`, `src/mcp/metadataBuilder.ts`, `src/server.ts`
- Tests: `src/__tests__/server.test.mjs`

### Estimated Effort

- Story Points: 5
- Time: ~3 developer days (planning + implementation + tests)

### References

- `docs/tech-spec.md`
- ChatGPT MCP auth expectations (internal doc)

## Dev Agent Record

### Context Reference

- docs/stories/story-context-central-mcp-compatibility.1.xml

### Debug Log

- Implemented MCP configuration parsing (`src/config/mcp.ts`) and registry management (`src/mcp/registry.ts`) with Zod validation.
- Added metadata builders (`src/mcp/metadataBuilder.ts`) and Express endpoints for `.well-known` documents plus MCP handshake/session routes (`src/server.ts`).
- Updated Better Auth bootstrap to initialise and refresh the MCP registry scopes (`src/auth.ts`).
- Documented operator workflow (`docs/integration/mcp-auth-checklist.md`) and shipped compliance harness (`scripts/mcp-compliance.mjs`).
- Expanded integration tests to cover MCP metadata using TypeBox schemas (`src/__tests__/server.test.mjs`).

### Completion Notes List

- Executed `pnpm build` and `pnpm test` to verify implementation and new test coverage.
- Validated the CLI harness with `pnpm mcp:compliance` against the local server.

### Completion Notes

**Completed:** 2025-10-24
**Definition of Done:** All acceptance criteria satisfied; registry, metadata, and compliance tooling verified by automated tests.

### Change Log

- 2025-10-24: Delivered MCP registry, metadata endpoints, compliance tooling, and documentation updates.
- 2025-10-24: Senior Developer review performed by drj (AI); outcome Approved.

### File List

- `.env.example`
- `README.md`
- `docs/bmm-workflow-status.md`
- `docs/integration/mcp-auth-checklist.md`
- `docs/sprint-status.yaml`
- `package.json`
- `pnpm-lock.yaml`
- `scripts/mcp-compliance.mjs`
- `src/auth.ts`
- `src/config/mcp.ts`
- `src/mcp/metadataBuilder.ts`
- `src/mcp/registry.ts`
- `src/server.ts`
- `src/__tests__/server.test.mjs`

## Senior Developer Review (AI)

**Reviewer:** drj (AI)  
**Date:** 2025-10-24  
**Outcome:** Approved

### Findings

- **OK**: Acceptance criteria AC1–AC4 verified. Registry parser (`src/config/mcp.ts`) enforces URL validation and default scopes; registry refresh keeps metadata current without restarts (`src/mcp/registry.ts`).
- **OK**: Discovery surfaces now expose MCP metadata and registry output (`src/mcp/metadataBuilder.ts`, `src/server.ts:176-320`). `/api/auth/mcp/handshake` validates origin/client pairs before returning enriched endpoints.
- **OK**: Compliance tooling and documentation provide clear operator workflow (`scripts/mcp-compliance.mjs`, `docs/integration/mcp-auth-checklist.md`, `.env.example`, `README.md`).
- **Tests**: `pnpm test`

### Action Items

- None.
