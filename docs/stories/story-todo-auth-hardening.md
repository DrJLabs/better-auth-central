# Story: Harden Better Auth for ChatGPT Todo MCP integration

Status: Done

## Story

As an operations engineer,
I want the central Better Auth server to support secure cross-origin login and consent for the ChatGPT Todo MCP client,
so that the client authenticates reliably across local and production environments.

## Acceptance Criteria

- [x] AC1: Requests from allowlisted origins respond with `Access-Control-Allow-Origin` matching the request origin and include `Access-Control-Allow-Credentials: true`.
- [x] AC2: Requests from disallowed origins return HTTP 403 with no session cookies issued.
- [x] AC3: Session cookies generated after login have `Secure`, `HttpOnly`, and `SameSite=None` attributes (HTTPS deployments) and use the `.onemainarmy.com` domain.
- [x] AC4: `/login` renders production-ready copy with a Google SSO call-to-action and no placeholder text.
- [x] AC5: `/consent` displays client identifier, requested scopes, and posts decisions to `/api/auth/oauth2/consent`.
- [x] AC6: `node scripts/check-discovery.mjs --base-url=https://auth.onemainarmy.com` completes successfully.
- [x] AC7: README and `.env.example` document required environment variables and trusted-origin overrides.
- [x] AC8: Updated `pnpm test` suite covers CORS responses, cookie attributes, and login/consent markup.

## Tasks / Subtasks

- [x] Implement `src/config/origins.ts` resolver and validation (AC1, AC2).
- [x] Add `cors` middleware and origin guard in `src/server.ts` (AC1, AC2).
- [x] Create `renderLoginPage` and `renderConsentPage` templates and update routes (AC4, AC5).
- [x] Configure Better Auth trusted origins and secure cookies in `src/auth.ts` (AC1, AC3).
- [x] Enhance `scripts/check-discovery.mjs` with `--base-url` option and logging (AC6).
- [x] Update `.env.example` and README documentation (AC7).
- [x] Extend `src/__tests__/server.test.mjs` with CORS, cookie, and HTML coverage (AC1, AC2, AC3, AC4, AC5, AC8).
- [x] Run `pnpm test` and both discovery smoke commands; attach results (AC6, AC8).

## Dev Notes

### Technical Summary

Leverage a shared origin allowlist for Express and Better Auth, enable cross-subdomain secure cookies derived from `BETTER_AUTH_URL`, and replace placeholder login/consent HTML with branded templates. Discovery smoke tooling gains a base URL flag so CI can validate the hosted environment.

### Project Structure Notes

- Files to modify: `package.json`, `pnpm-lock.yaml`, `src/config/origins.ts`, `src/server.ts`, `src/auth.ts`, `src/ui/loginPage.ts`, `src/ui/consentPage.ts`, `src/__tests__/server.test.mjs`, `scripts/check-discovery.mjs`, `.env.example`, `README.md`.
- Expected test locations: `src/__tests__/server.test.mjs`, discovery smoke script output, manual MCP client walkthrough.
- Estimated effort: 3 story points (2-3 days).

### References

- **Tech Spec:** See docs/tech-spec.md for detailed implementation
- **Architecture:** docs/architecture.md

## Dev Agent Record

### Context Reference

- Context generation skipped (story-context workflow optional for this change)

### Agent Model Used

<!-- Will be populated during dev-story execution -->

### Debug Log References

- Added shared origin resolver in `src/config/origins.ts` and configured Express CORS + guard middleware.
- Updated `src/auth.ts` to align Better Auth cookies/trusted origins with `BETTER_AUTH_URL` and new resolver.
- Replaced placeholder login/consent HTML with reusable templates under `src/ui`.
- Extended discovery smoke script with `--base-url` support and logged target URLs.
- Augmented server integration tests for CORS behaviour, discovery responses, and new HTML output.

### Completion Notes List

- Ran `pnpm build` and `pnpm test` (includes discovery smoke) to verify all acceptance criteria.
- Confirmed documentation updates reflect new trusted-origin configuration and CLI usage.

### Completion Notes

**Completed:** 2025-10-16
**Definition of Done:** All acceptance criteria met, review approved, tests passing.

### Change Log

- 2025-10-16: Implemented story changes (auth hardening, templates, docs, tests).
- 2025-10-16: Senior Developer review completed – outcome Approved.
- 2025-10-16: Story marked Done after DoD verification.

### File List

- `package.json`
- `pnpm-lock.yaml`
- `src/config/origins.ts`
- `src/ui/loginPage.ts`
- `src/ui/consentPage.ts`
- `src/server.ts`
- `src/auth.ts`
- `src/__tests__/server.test.mjs`
- `scripts/check-discovery.mjs`
- `.env.example`
- `README.md`

## Senior Developer Review (AI)

- **Reviewer:** drj (AI)
- **Date:** 2025-10-16
- **Outcome:** Approve

### Summary

Story delivers hardened CORS/cookie behaviour, refreshed login and consent UI, and extends smoke/testing coverage needed for the ChatGPT Todo integration. Implementation aligns with the documented architecture.

### Key Findings

- **High:** None
- **Medium:** None
- **Low:** Consider keeping origin rejection log at warn level to aid ops visibility. No change required now.

### Acceptance Criteria Coverage

- AC1–AC5 verified via new Supertest suites (`src/__tests__/server.test.mjs`).
- AC6 satisfied by running `pnpm test` which executes smoke checks including `--base-url` path.
- AC7 confirmed through updates to `.env.example` and README.
- AC8 covered by the expanded integration tests.

### Test Coverage and Gaps

- Automated tests cover allowed/blocked origins and HTML templates.
- Smoke script validates discovery endpoints for local and production. No gaps identified.

### Architectural Alignment

- Changes fit the Express + Better Auth design documented in `docs/architecture.md`. Shared origin resolver keeps configuration DRY.

### Security Notes

- Enforced allowlist reduces CORS attack surface.
- Secure cookie settings depend on `BETTER_AUTH_URL`; documentation highlights required values.

### Best-Practices and References

- Express CORS guidance – https://expressjs.com/en/resources/middleware/cors.html
- OAuth consent experience guidelines – https://developers.google.com/identity

### Action Items

- None
