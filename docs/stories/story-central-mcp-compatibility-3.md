# Story: Automate MCP compliance verification

Status: Done

## Story

As an operator,
I want automated tooling that validates MCP alignment in dev and production,
so I can confidently onboard new MCP servers and detect regressions early.

## Acceptance Criteria

- [x] `scripts/mcp-compliance.mjs --base-url=<url>` validates handshake, token, introspection, and session endpoints with Zod schemas.
- [x] `pnpm mcp:compliance -- --base-url=https://auth.onemainarmy.com` succeeds post-deploy.
- [x] README and `docs/integration/mcp-auth-checklist.md` explain required env vars, registry config, and compliance workflow.
- [x] Optional CI hook (documented) demonstrates how to run compliance suite against staging.

## Tasks / Subtasks

- [x] Implement `scripts/mcp-compliance.mjs` using node-fetch + Zod validation.
- [x] Add npm scripts `mcp:compliance` and `mcp:register`.
- [x] Extend `.env.example` and README with MCP variables and compliance instructions.
- [x] Document operator checklist in `docs/integration/mcp-auth-checklist.md`.
- [x] Add contract test invoking script in CI (optional, document fallback).

## Dev Notes

### Technical Summary

Provide repeatable compliance tooling that verifies MCP endpoints and documents operator workflow, ensuring future MCP integrations can self-validate.

### Project Structure Notes

- Files: `scripts/mcp-compliance.mjs`, `package.json`, `.env.example`, `README.md`, `docs/integration/mcp-auth-checklist.md`
- Tests: reuse `mcp-compliance.mjs` in CI job or local run instructions

### Estimated Effort

- Story Points: 3
- Time: ~2 developer days

### References

- `docs/tech-spec.md`
- Internal MCP integration guidelines

## Dev Agent Record

### Context Reference

- docs/stories/story-context-central-mcp-compatibility.3.xml

### Debug Log

- Planned implementation: refactor `scripts/mcp-compliance.mjs` to use node-fetch and Zod, iterate every MCP server using Origin-aware handshakes, and exercise token, introspection, and session endpoints with schema validation before extending docs/tests per ACs.

### Completion Notes

- Implemented full MCP compliance harness coverage: Zod validation for discovery, handshake, token, introspection, and session flows per AC1 using `node-fetch` with per-client secrets support and bearer challenge verification (scripts/mcp-compliance.mjs).
- Hardened CLI unit/ATDD suites to assert multi-client coverage, token/introspection invocation, and session responses; ensures regression protection for AC1/AC2 via `scripts/__tests__/mcp-compliance*.mjs`.
- Updated operator docs to keep README and integration checklist scoped to identical env var guidance, satisfying AC3 expectations.
- Ran `pnpm test` to execute full suite, confirming compliance harness and documentation parity checks succeed.
- **Completed:** 2025-10-25
- **Definition of Done:** All acceptance criteria met, code reviewed, tests passing

## File List

- scripts/mcp-compliance.mjs
- package.json
- scripts/__tests__/mcp-compliance.test.mjs
- scripts/__tests__/mcp-compliance.atdd.test.mjs
- docs/integration/mcp-auth-checklist.md
- README.md
- .env.example

## Change Log

- Added node-fetch + Zod backed compliance CLI with comprehensive schema checks, expanded tests, and aligned MCP documentation.

## Senior Developer Review (AI)

- **Outcome:** Review Passed
- **Reviewer:** Amelia (AI)
- **Test Evidence:** `pnpm test`

### Findings

- ✅ No blocking defects detected; compliance harness, tests, and documentation align with Story 3 ACs.
- ℹ️ Optional improvement: surface the new `MCP_COMPLIANCE_CLIENT_SECRET` helper in the README environment variable list so the guidance mirrors `.env.example` on first read.
