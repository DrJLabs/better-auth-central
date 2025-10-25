# better-auth-central - Technical Specification

**Author:** drj
**Date:** 2025-10-17
**Project Level:** 1
**Project Type:** backend
**Development Context:** brownfield – align the central Better Auth server so multiple MCP servers can integrate using the ChatGPT MCP auth expectations

---

## Source Tree Structure

- `package.json` / `pnpm-lock.yaml` — add runtime dependency `zod@3.23.8` for schema validation and dev dependency `@sinclair/typebox@0.32.35` for contract fixtures.
- `src/config/origins.ts` — extend with MCP client registry aware defaults and helper to emit CORS + MCP discovery origins from one list.
- `src/config/mcp.ts` (new) — define MCP capability flags, required scopes, and client registration schema.
- `src/auth.ts` — surface MCP-aware trusted client configuration, enforce scope negotiation, and advertise supported grant types.
- `src/server.ts` — expose MCP metadata routes (`/.well-known/mcp-servers.json`, handshake/session endpoints) and ensure origin cache refreshes.
- `src/mcp/registry.ts` (new) — maintain in-memory + persistent registry of enabled MCP servers with origin, scopes, and metadata cache.
- `src/mcp/metadataBuilder.ts` (new) — build discovery documents (JSON + `.well-known/` endpoints) from registry + config.
- `scripts/mcp-compliance.mjs` (new) — run MCP compliance suite against local or remote base URL.
- `src/__tests__/server.test.mjs` — contract tests validating MCP metadata and handshake/session payloads with TypeBox schemas.
- `docs/integration/mcp-auth-checklist.md` (new) — operator guide describing required env vars, endpoints, and validation steps.
- `.env.example` / `README.md` — document MCP registry configuration, compliance script usage, and required scopes.

---

## Technical Approach

Create a single integration contract that covers OAuth endpoints, discovery metadata, and runtime session APIs expected by ChatGPT MCP clients. The central Better Auth server becomes the “Compatibility Hub” that:

1. Registers MCP servers with explicit scopes, redirect URIs, and allowed origins using a typed registry module backed by environment config.
2. Generates discovery metadata (`/.well-known/better-auth.json`, `/.well-known/mcp-servers.json`) and syncs them with the OAuth issuer metadata so ChatGPT apps only need a single base URL.
3. Normalizes OAuth2 responses (error codes, token payloads, introspection shape) to the ChatGPT MCP schema, including `client_id`, `resource`, `scope`, and `expires_in` fields.
4. Exposes MCP session helpers (`/api/auth/mcp/session`, `/api/auth/mcp/handshake`) that wrap Better Auth session APIs but return the exact JSON structure the ChatGPT Todo and future MCP clients expect.
5. Ships an automated compliance harness (`scripts/mcp-compliance.mjs` + contract tests) to guard the alignment going forward.

All work remains within the existing Node + Express service; no extra services or databases are introduced. The registry persists to JSON under `better-auth.sqlite` via Better Auth plugin storage so deployments do not add new infrastructure.

---

## Implementation Stack

- Node.js 20.x runtime (existing project standard)
- Express 5.1.0 + Better Auth 1.3.27 (`jwt`, `oidcProvider`, `mcp` plugins)
- Zod 3.23.8 for contract validation
- TypeScript 5.9.3 + ts-node for scripts
- Supertest 7.1.4 + Node test runner
- Playwright 1.48.2 (existing dev dependency) reused for end-to-end consent assertions where needed

---

## Technical Details

- **MCP Registry**: `src/mcp/registry.ts` loads `MCP_CLIENTS` from config (JSON encoded array) and persists runtime overrides in Better Auth storage. Each client entry includes `id`, `origin`, `scopes`, `redirectUri`, and `resource`.
- **Endpoint Alignment**:
  - `/api/auth/oauth2/token` returns `{ access_token, token_type, expires_in, scope, client_id, resource }` exactly matching MCP schema.
  - `/api/auth/oauth2/introspect` converts Better Auth boolean flags (`active`, `exp`, `sub`, `scope`) and appends `client_id`, `resource`, and `issued_token_type` fields.
  - `/api/auth/mcp/session` wraps Better Auth session lookup and returns `{ userId, clientId, scopes, issuedAt, expiresAt, resource }`.
  - `/api/auth/mcp/handshake` ensures the requesting origin is registered and returns OAuth endpoints, discovery URLs, and consent URL.
- **Discovery Metadata**: `src/mcp/metadataBuilder.ts` publishes consolidated metadata at:
  - `/.well-known/mcp-servers.json` → list of registered servers (id, origin, scopes, handshake URL).
  - `/.well-known/openid-configuration` → adds `mcp_session_endpoint`, `mcp_scopes_supported`, and `mcp_handshake_endpoint` extensions.
- **Config Surface**:
  - `MCP_CLIENTS` (JSON array) and `MCP_DEFAULT_SCOPES` env vars control initial registry.
  - `MCP_ENFORCE_SCOPE_ALIGNMENT=true` toggles strict scope validation.
- **Compliance Script**: `scripts/mcp-compliance.mjs --base-url=<url>` runs handshake, token, introspection, and session flows with deterministic assertions using Zod schemas.
- **Security Posture**: All new routes reuse the origin guard + secure cookie configuration established previously and log denied origins at warn level for observability.

---

## Development Setup

1. `cp .env.example .env` and populate:
   - `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `MCP_RESOURCE`, `MCP_DEFAULT_SCOPES`, `MCP_CLIENTS` (JSON array), `MCP_ENFORCE_SCOPE_ALIGNMENT`.
   - Optional overrides: `BETTER_AUTH_COOKIE_DOMAIN`, `BETTER_AUTH_TRUSTED_ORIGINS`.
2. Install dependencies: `pnpm add zod` and `pnpm add -D @sinclair/typebox`.
3. Run migrations: `pnpm better-auth migrate` (ensures registry tables exist) — idempotent.
4. Start dev server with `pnpm dev` and run the Todo MCP client pointing to `http://localhost:3000` for quick verification.
5. Use `pnpm mcp:register` (new script alias for `scripts/mcp-compliance.mjs --register`) to seed local MCP clients.

---

## Implementation Guide

1. **Configuration Layer**
    a. Extend `src/config/origins.ts` to emit MCP discovery origins from the same resolver.
    b. Add `src/config/mcp.ts` with Zod schema for MCP clients, default scopes, and helper to read env JSON.

2. **Registry + Metadata**
   a. Implement `src/mcp/registry.ts` to load config, allow runtime overrides, and expose read/write API.
   b. Implement `src/mcp/metadataBuilder.ts` to derive discovery documents and augment OpenID configuration.

3. **Routing**
   a. Update `src/server.ts` to register `.well-known` endpoints and dedicated MCP handshake/session routes.

4. **Auth Integration**
   a. Update `src/auth.ts` to read MCP registry, apply scope negotiation, and inject metadata into Better Auth issuer config.
   b. Enable granular logging for denied MCP requests.

5. **Tooling + Tests**
  a. Create `scripts/mcp-compliance.mjs` using TypeBox validators to assert metadata integrity.
  b. Extend `src/__tests__/server.test.mjs` to cover MCP metadata endpoints and handshake/session behaviour.
  c. Update documentation: `.env.example`, `README.md`, `docs/integration/mcp-auth-checklist.md`.

6. **DX Enhancements**
   a. Wire npm script aliases: `"mcp:test": "node --loader ts-node/esm scripts/mcp-compliance.mjs"`.
   b. Publish API reference snippet in new doc.

---

## Testing Approach

- **Automated Contract Tests**: `pnpm test` runs updated `src/__tests__/server.test.mjs` verifying MCP metadata, handshake, and session contracts via TypeBox schemas.
- **Smoke Suite**: `pnpm mcp:compliance -- --base-url=http://localhost:3000` and `--base-url=https://auth.onemainarmy.com` ensure endpoints remain MCP-compatible.
- **Client Validation**: Exercise ChatGPT Todo client and one additional MCP sample server using the new registry to confirm multi-client support.
- **Regression**: Existing CORS/login/consent tests remain; add snapshot for discovery metadata to catch drift.

---

## Deployment Strategy

1. Merge changes after `pnpm build`, `pnpm test`, and `pnpm mcp:compliance -- --base-url=http://localhost:3000` succeed.
2. Deploy via existing pipeline; ensure environment adds `MCP_CLIENTS` and `MCP_DEFAULT_SCOPES` variables.
3. Post-deploy checklist:
   - Run `pnpm mcp:compliance -- --base-url=https://auth.onemainarmy.com`.
   - Verify `.well-known/openid-configuration` exposes MCP extensions.
   - Validate ChatGPT Todo MCP client plus a second MCP server handshake successfully.
4. Monitor logs for rejected origins or scope mismatches; adjust registry or config as needed.
5. Share updated `docs/integration/mcp-auth-checklist.md` with operators before onboarding new MCP servers.

## Post-Review Follow-ups

- **2025-10-28 · Story 1.2 (High, Auth Platform · Resolved):** OAuth token proxy now reserializes the sanitized scope list before invoking Better Auth so unauthorized scopes can never be minted (`src/routes/oauthRouter.ts`).
