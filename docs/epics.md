# better-auth-central - Epic Breakdown

## Epic Overview

**Epic:** Central MCP Compatibility Alignment
**Goal:** Ensure the Better Auth central server speaks a first-class MCP auth dialect so ChatGPT apps and developer-mode MCP servers integrate with zero custom glue.
**Scope:**
- Register MCP clients with shared registry and publish discovery metadata.
- Normalize OAuth2 + session endpoints to MCP schema expectations.
- Ship compliance tooling and docs operators use to onboard new MCP servers.
**Success Criteria:**
- `/api/auth/oauth2/*` endpoints return ChatGPT MCP compliant payloads.
- `.well-known` metadata enumerates all registered MCP servers and handshake URLs.
- `pnpm mcp:compliance -- --base-url` passes for dev + prod URLs.
- New MCP server can integrate using registry config only (no manual endpoint tweaks).
**Dependencies:**
- Existing Better Auth OAuth provider.
- MCP client credentials (ChatGPT Todo, future services).

---

## Epic Details

### Story 1: Establish MCP registry and metadata
- **Summary:** Build typed MCP client registry and generate discovery metadata that ChatGPT MCP clients consume.
- **Acceptance Criteria:**
  1. MCP registry persists `id`, `origin`, `scopes`, `resource`, and `redirectUri` using schema validation.
  2. `/.well-known/mcp-servers.json` lists all registered MCP servers with handshake and session URLs.
  3. `/.well-known/openid-configuration` exposes `mcp_session_endpoint`, `mcp_handshake_endpoint`, and `mcp_scopes_supported` extensions.
  4. Registry updates propagate to metadata without restarting the server.
- **Implementation Notes:**
  - Implement `src/config/mcp.ts`, `src/mcp/registry.ts`, and `src/mcp/metadataBuilder.ts`.
  - Extend origin resolver to account for registry origins.
  - Update `src/server.ts` to publish new `.well-known` endpoints.
  - Add docs: `docs/integration/mcp-auth-checklist.md`.
- **Story Points:** 5

### Story 2: Align OAuth + MCP session endpoints
- **Summary:** Normalize OAuth2 token, introspection, and session helper endpoints to the exact schema ChatGPT MCP clients expect.
- **Acceptance Criteria:**
  1. `/api/auth/oauth2/token` returns payload with `access_token`, `token_type`, `expires_in`, `scope`, `client_id`, and `resource`.
  2. `/api/auth/oauth2/introspect` returns the same JSON structure validated by the compliance suite (active, exp, scope, client_id, resource, issued_token_type).
  3. `/api/auth/mcp/session` exposes `{ userId, clientId, scopes, issuedAt, expiresAt, resource }` when given valid session cookies.
  4. `/api/auth/mcp/handshake` validates requesting origin against registry and responds with OAuth endpoints, consent URL, and metadata URLs.
- **Implementation Notes:**
  - Refactor `src/routes/oauthRouter.ts` and add `src/routes/mcpRouter.ts`.
  - Update `src/auth.ts` to negotiate scopes and log denied requests.
  - Add Zod schemas in `src/mcp/schemas.ts` and contract tests in `src/__tests__/mcp-compliance.test.mjs`.
- **Story Points:** 5

### Story 3: Automate MCP compliance verification
- **Summary:** Provide scripts and docs so operators can verify MCP alignment in dev and production environments.
- **Acceptance Criteria:**
  1. `scripts/mcp-compliance.mjs` accepts `--base-url` and validates handshake, token, introspection, and session endpoints via Zod schemas.
  2. `pnpm mcp:compliance -- --base-url=https://...` succeeds for production deployment.
  3. README and integration checklist document required env vars and compliance script usage.
  4. GitHub workflow hook (optional but recommended) runs compliance script on CI against staging URL.
- **Implementation Notes:**
  - Add npm scripts for compliance + registry seeding.
  - Extend `.env.example` with MCP variables.
  - Consider adding Playwright smoke for consent UI as stretch goal.
- **Story Points:** 3

### Story 4: Enforce MCP compliance checks in CI
- **Summary:** Integrate the MCP compliance CLI into staging and main CI workflows so regressions block merges and deployments.
- **Acceptance Criteria:**
  1. GitHub Actions workflow executes `pnpm mcp:compliance` against staging and main base URLs on every PR and main branch push.
  2. Compliance job fails the pipeline when MCP contract checks fail.
  3. Pipeline documentation references the new MCP compliance check with rerun guidance.
  4. Compliance job secrets and environment variables are sourced securely without leaking credentials.
- **Implementation Notes:**
  - Update existing CI workflows or add a dedicated `mcp-compliance` job invoking the CLI with appropriate base URLs.
  - Use reusable scripts or env configuration to share setup with discovery smoke tests.
  - Document the workflow addition in the README or CI guide.
- **Story Points:** 3

### Story 5: Publish MCP onboarding runbook
- **Summary:** Produce an operator-facing runbook that documents MCP environment variables, compliance steps, rollback guidance, and escalation paths.
- **Acceptance Criteria:**
  1. Runbook covers environment setup, registry updates, compliance CLI usage, and validation steps for new MCP clients.
  2. Includes rollback procedures and contact points for escalation.
  3. README or integration docs link to the runbook for quick discovery.
  4. Any referenced scripts or checklists exist and are up to date.
- **Implementation Notes:**
  - Author the runbook under `docs/integration/` or similar operations folder.
  - Align with existing integration checklist to avoid duplication.
  - Capture operator feedback loops and logging requirements where applicable.
- **Story Points:** 2
