# MCP Authentication Integration Checklist

This checklist documents the configuration that platform operators must provide when onboarding a new MCP server to the Better Auth central service.

## Prerequisites

- Populate the following environment variables before booting the server:
  - `BETTER_AUTH_TRUSTED_ORIGINS`: optional comma-separated list of additional origins allowed to call the server (for example, staging Todo clients). The defaults already include `http://localhost:5173`, `http://localhost:3000`, `https://todo.onemainarmy.com`, and `https://auth.onemainarmy.com`.
  - `MCP_RESOURCE`: identifier returned in the protected-resource metadata (defaults to the server base URL).
  - `MCP_DEFAULT_SCOPES`: space- or comma-separated scopes applied when an MCP client omits the `scopes` field (defaults to `openid`).
  - `MCP_CLIENTS`: JSON array describing MCP clients (id, origin, resource, scopes, redirectUri). Leave as `[]` until you are ready to onboard a client.
  - `MCP_ENFORCE_SCOPE_ALIGNMENT`: set to `true` (default) to block clients that request scopes outside of the configured catalogue.
  - `MCP_COMPLIANCE_CLIENT_SECRET`: optional shared secret used by the compliance harness when invoking token/introspection endpoints.

## Registry expectations

- Every client entry requires:
  1. `id` – unique identifier used in handshake queries.
  2. `origin` – absolute URL that must already be present in the trusted origins list.
  3. `resource` – identifier returned to the client (usually your MCP deployment URL).
  4. `redirectUri` – OAuth redirect URI for dynamic registration.
  5. `scopes` – optional array; defaults to the configured MCP default scopes when omitted.

- At runtime the registry can be refreshed without restart by updating the environment variables and hitting any of:
  - `/.well-known/oauth-authorization-server`
  - `/.well-known/mcp-servers.json`
  - `/api/auth/mcp/handshake`

## Verification workflow

1. Start the server with your updated `.env` values.
2. Run the compliance suite:
   ```bash
   pnpm mcp:compliance -- --base-url=https://auth.example.com
   ```
   The command validates the discovery endpoints, the MCP servers document, and the session challenge behaviour.
3. Optional: list registered clients without performing the compliance assertions:
   ```bash
   pnpm mcp:register -- --base-url=https://auth.example.com
   ```
   This prints the configured clients and exposes the handshake endpoints they should hit during onboarding.

## Handshake outputs

For each registered client the following metadata is exposed:

| Field | Description |
| ----- | ----------- |
| `handshakeEndpoint` | HTTPS endpoint that MCP clients call to retrieve OAuth endpoints + scopes. |
| `sessionEndpoint` | Endpoint that returns the active MCP session (requires bearer token). |
| `mcp_servers_metadata` | Location of the complete servers registry document. |
| `mcp_scopes_supported` | Catalog of all scopes exposed by the central auth server. |

Clients must call the handshake endpoint with the `client_id` query parameter and the matching `Origin` header. Mismatched origins are rejected with HTTP 403 to prevent spoofed registrations.
