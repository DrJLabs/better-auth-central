# Better Auth Central Server

This project provisions a standalone Better Auth server backed by SQLite and prepared for Google as an identity provider. It is intended to run as a centralized authentication service that other applications can call via REST.

## Prerequisites

- Node.js 22.5 or later (needed for the optional `node:sqlite` driver and ships with `corepack`, which provides `pnpm`)
- `pnpm` (auto-enabled via `corepack enable pnpm` if necessary)

## Getting Started

1. Install dependencies:
   ```bash
   pnpm install
   ```
2. Copy the example environment file and fill in the values:
   ```bash
   cp .env.example .env
   ```
   - `BETTER_AUTH_SECRET`: random string used for token signing.
   - `BETTER_AUTH_URL`: public URL where this server is accessible.
   - `BETTER_AUTH_DB_DRIVER`: database driver (`better-sqlite3` for production, or `node` to use Node's built-in SQLite module when native builds aren't available).
   - `BETTER_AUTH_TRUSTED_ORIGINS`: optional comma-separated list of additional origins allowed to call the server (for example, staging Todo clients). The defaults already include `http://localhost:5173`, `http://localhost:3000`, `https://todo.onemainarmy.com`, and `https://auth.onemainarmy.com`.
   - `BETTER_AUTH_COOKIE_DOMAIN`: optional registrable parent domain (for example, `.onemainarmy.com`) used when issuing HTTPS cookies so sessions can be shared across sibling subdomains.
   - `DISCOVERY_TIMEOUT_MS`: optional timeout (in milliseconds) for the discovery smoke checks; defaults to `10000` if unset.
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: obtained from Google Cloud Console. Leave empty initially if you plan to wire them in later.
   - `OIDC_LOGIN_PATH`: path to the login UI that should handle OIDC `prompt=login` flows (defaults to `/login`).
   - `OIDC_CONSENT_PATH`: path that renders a consent screen and posts to `/api/auth/oauth2/consent` (defaults to `/consent`).
   - `OIDC_DYNAMIC_REGISTRATION`: set to `true` when you explicitly need dynamic client registration; defaults to `false` so production deployments keep the surface disabled unless required.
   - `MCP_RESOURCE`: identifier returned in the protected-resource metadata (defaults to the server base URL).
   - `MCP_DEFAULT_SCOPES`: space- or comma-separated scopes applied when an MCP client omits the `scopes` field (defaults to `openid`).
   - `MCP_CLIENTS`: JSON array describing MCP clients (id, origin, resource, scopes, redirectUri). Leave as `[]` until you are ready to onboard a client.
   - `MCP_ENFORCE_SCOPE_ALIGNMENT`: set to `true` (default) to block clients that request scopes outside of the configured catalogue.
   - `MCP_COMPLIANCE_CLIENT_SECRET`: optional shared secret used by the compliance harness when invoking token/introspection endpoints.
3. Generate the database schema (optional but recommended when first bootstrapping):
   ```bash
   pnpm auth:generate
   ```
4. Apply migrations:
   ```bash
   pnpm auth:migrate
   ```
5. Start the development server:
   ```bash
   pnpm dev
   ```

The server listens on `http://localhost:3000` by default and exposes Better Auth at `/api/auth/*`. A simple health check is available at `/healthz`.

### Verify discovery endpoints

With the server running, confirm that MCP and OIDC discovery are reachable:

```bash
curl -fsS "$BETTER_AUTH_URL/.well-known/oauth-authorization-server" | jq
curl -fsS "$BETTER_AUTH_URL/.well-known/oauth-protected-resource" | jq
```

These responses must include a `registration_endpoint`, `jwks_uri`, and the resource metadata required by MCP clients. If `registration_endpoint` is missing, confirm `OIDC_DYNAMIC_REGISTRATION=true` is set (dynamic registration is disabled by default for production safety).

You can run the automated smoke check locally once the server is running:

```bash
pnpm smoke:discovery
```

To verify the hosted deployment, supply the production base URL:

```bash
pnpm smoke:discovery -- --base-url=https://auth.onemainarmy.com
```

### MCP compliance

In addition to the discovery smoke test, run the MCP compliance harness to validate the registry, handshake, and session endpoints:

```bash
pnpm mcp:compliance -- --base-url=https://auth.onemainarmy.com
```

Use the registry helper to print the currently configured MCP clients:

```bash
pnpm mcp:register -- --base-url=https://auth.onemainarmy.com
```

Both commands are exposed via the `mcp:*` scripts in `package.json` and backed by the `scripts/mcp-compliance.mjs` CLI.

#### CI automation

The repository ships with `.github/workflows/discovery-smoke.yml`, which now runs two jobs on every pull request and push to `main`:

1. `smoke-test` provisions Node, installs dependencies, builds the service, and exercises the discovery smoke checks.
2. `mcp-compliance` reuses the build cache, validates required secrets, and runs `pnpm mcp:compliance` against both staging and production (`main`) base URLs. The job exits non-zero if the CLI surfaces contract regressions, blocking the workflow.

Configure these GitHub Actions secrets before enabling the job:

- `MCP_COMPLIANCE_BASE_URL_STAGING`: base URL for the staging deployment targeted by the compliance gate.
- `MCP_COMPLIANCE_BASE_URL_MAIN`: base URL for the primary (main) deployment targeted by the compliance gate.
- `MCP_COMPLIANCE_CLIENT_ID`: registered MCP client identifier used by the compliance harness.
- `MCP_COMPLIANCE_SCOPE`: space-separated scopes expected by the compliance client (must align with the registry entry).

Reuse the compliance client secret described in the prerequisites section by storing it as a GitHub secret.

**Rerun guidance**

1. Open the PR’s **Checks** tab (or the workflow run) and select the `discovery-smoke` workflow.
2. Choose **Re-run jobs → Re-run failed jobs** to retry only the failing stage, or **Re-run all jobs** to rebuild from scratch.
3. For CLI-driven retries, run `gh workflow run discovery-smoke.yml -f ref=<branch>` to queue a fresh execution.

**Failure triage**

- Inspect the `Run compliance against staging/main` steps for the exact endpoint or scope mismatch highlighted by the CLI.
- Reproduce locally with `pnpm mcp:compliance -- --base-url=<environment>` to get verbose stack traces.
- Confirm the GitHub secrets listed above point at live environments and that the MCP client registry matches the deployment.

## Production build

```bash
pnpm build
BETTER_AUTH_SECRET=your-secret pnpm start
```

## Project Structure

- `src/auth.ts` – Better Auth configuration (SQLite database, Google provider stub).
- `src/server.ts` – Express server that forwards `/api/auth` traffic to Better Auth and serves `.well-known` discovery documents, MCP metadata, and registry-backed endpoints.
- `src/mcp/` – Registry helpers and metadata builders powering the MCP compatibility layer.
- `scripts/mcp-compliance.mjs` – CLI harness that validates the MCP discovery metadata, handshake endpoint, and bearer challenge.
- `better-auth.sqlite` – SQLite database file (created on first run).

## Next Steps

- Customise the login (`OIDC_LOGIN_PATH`) and consent (`OIDC_CONSENT_PATH`) templates in `src/ui/loginPage.ts` and `src/ui/consentPage.ts` to reflect your branding or additional flows. The defaults now expose a Google sign-in CTA and a consent experience ready for immediate use.
- Return to the Google Cloud Console once ready to register OAuth credentials, then populate `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- Configure additional providers or auth flows by extending `src/auth.ts`.
- Integrate this server with your MCP client or other services by pointing them at the `/api/auth` endpoints and the `.well-known` discovery URLs listed above. A GitHub Actions workflow (`discovery-smoke`) runs on every push/PR to keep these endpoints healthy. Set `BETTER_AUTH_DB_DRIVER=node` in CI or other environments where compiling `better-sqlite3` is not desirable; production should continue using the default `better-sqlite3` driver for performance.
