# MCP Onboarding Runbook

This runbook guides auth operators through onboarding a new Managed Client Platform (MCP) tenant to Better Auth Central. It expands on the integration checklist located at `docs/integration/mcp-auth-checklist.md` by providing operational detail, validation flow, and troubleshooting cues.

## Audience & Prerequisites

- Audience: Auth Operations and SRE engineers responsible for managing MCP tenants.
- Prerequisites:
  - Access to the deployment environment targeted for onboarding (staging or production).
  - Permission to edit the MCP registry (`MCP_CLIENTS`) and restart deployments if required.
  - Credentials for the compliance CLI (`MCP_COMPLIANCE_CLIENT_SECRET` and optional client-specific overrides).
  - Familiarity with the MCP Authentication Integration Checklist — always cross-reference the checklist when updating environment variables to avoid drift.

## Environment Configuration Reference

The table aggregates the MCP-specific variables from `.env.example` and `docs/integration/mcp-auth-checklist.md`. Confirm values before onboarding and document overrides in your team’s secrets manager.

| Variable | Purpose | Default / Guidance |
| --- | --- | --- |
| `MCP_CLIENTS` | JSON array of MCP client definitions (id, origin, resource, scopes, redirectUri). Must include the new tenant before compliance validation. | `[]` until onboarding. Keep origins in sync with `BETTER_AUTH_TRUSTED_ORIGINS`. |
| `MCP_DEFAULT_SCOPES` | Scopes applied when a client omits `scopes`. | `openid` |
| `MCP_ENFORCE_SCOPE_ALIGNMENT` | Blocks clients requesting scopes outside the configured catalogue. | `true` — only disable for emergency troubleshooting. |
| `MCP_RESOURCE` | Identifier returned in protected-resource metadata. | Defaults to server base URL. |
| `MCP_COMPLIANCE_BASE_URL_STAGING` / `MCP_COMPLIANCE_BASE_URL_MAIN` | Base URLs targeted by the compliance harness. | Populate for each deployment tier. |
| `MCP_COMPLIANCE_CLIENT_ID` | Client ID used by the compliance harness. | Must match entry in `MCP_CLIENTS`. |
| `MCP_COMPLIANCE_SCOPE` | Scopes asserted during compliance validation. | Should align with registry entry scopes. |
| `MCP_COMPLIANCE_CLIENT_SECRET` or `MCP_COMPLIANCE_SECRET_<CLIENT>` | Shared secret(s) used to complete token and introspection flows during compliance validation. | Optional global secret. Add per-client override if needed. |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Comma-separated list of allowed origins. | Defaults cover core apps; append the new tenant’s origin before onboarding. |
| `OIDC_DYNAMIC_REGISTRATION` | Enables dynamic client registration flow. | `false` — enable only when onboarding requires it. |

> The `<CLIENT>` suffix uses the client ID uppercased with non-alphanumeric characters replaced by underscores (for example, `my-app-1` becomes `MCP_COMPLIANCE_SECRET_MY_APP_1`).

> Reference: This runbook expands on `docs/integration/mcp-auth-checklist.md` and captures the most current operational guidance.

## Onboarding Workflow

1. **Preflight audit**
   - Confirm the target deployment is reachable and uses the correct base URL (`https://auth.<tenant-domain>` or staging equivalent).
   - Review outstanding TODOs or incidents; abort onboarding if there is an open MCP compliance failure.
  - Gather tenant metadata: client ID, expected scopes, origin(s), and redirect URI.

2. **Update environment configuration**
   - Duplicate the existing `.env` file for the target environment and update the variables listed above.
   - Append the new client definition to `MCP_CLIENTS` with aligned `origin`, `resource`, `scopes`, and `redirectUri`.
   - Ensure any new origins are present in `BETTER_AUTH_TRUSTED_ORIGINS` and deployed via infrastructure automation.
   - For secrets, create or update the record in the secrets manager before promoting changes.

3. **Deploy registry change**
   - Apply environment updates through the platform’s deployment pipeline.
   - After deployment, hit the discovery endpoints to refresh caches:
     - `/.well-known/oauth-authorization-server`
     - `/.well-known/mcp-servers.json`
     - `/api/auth/mcp/handshake?client_id=<new-client-id>` (include `Origin` header)
   - Validate the registry now lists the new client using `pnpm mcp:register -- --base-url=<environment>`.

4. **Run compliance validation**
   - Execute the compliance harness from the repository root:

     ```bash
     pnpm mcp:compliance -- --base-url=<environment>
     ```

   - Expected success output (abbreviated):

     ```text
     Running MCP compliance checks against https://auth.onemainarmy.com
     • Found 2 registered MCP server(s)
     • OpenID metadata advertises MCP extensions

     Validating client todo-client (https://todo.onemainarmy.com)
       • Handshake endpoint returned validated metadata
       • Session endpoint demands bearer authentication
       • Skipping client_credentials flow (grant not advertised); session challenge verified

     Validating client compliance-bot (https://auth.onemainarmy.com)
       • Handshake endpoint returned validated metadata
       • Session endpoint demands bearer authentication
       • Skipping client_credentials flow (grant not advertised); session challenge verified

     ✅ MCP compliance checks passed
     ```

   - When the target deployment advertises the `client_credentials` grant, the CLI prints additional lines for token and introspection validation. If the grant is absent, expect the “Skipping client_credentials flow” message shown above.
   - Use `pnpm mcp:register -- --base-url=...` to print registry entries without running compliance assertions. Passing `--register` to `pnpm mcp:compliance` still executes the full validation suite and then prints a registry summary at the end.

## Compliance Failure Handling

When the CLI exits with `❌ MCP compliance failed`, inspect the error message and align with the scenarios below:

- `Handshake clientId mismatch`: registry `id` and handshake response `clientId` differ. Confirm `MCP_CLIENTS` entry and server deployment are in sync.
- `Session endpoint ... missing WWW-Authenticate`: the session route is not enforcing bearer authentication. Verify middleware configuration and redeploy.
- `Handshake for <client>` returning `403` or `missing_origin`: the compliance harness origin header is not whitelisted. Update `BETTER_AUTH_TRUSTED_ORIGINS` and redeploy.
- `token_endpoint returned 400`: usually indicates the compliance client secret or scopes are misconfigured. Regenerate credentials or update `MCP_COMPLIANCE_*` environment variables.
- `did not return JSON payload`: one of the discovery endpoints is serving HTML or an error page. Check ingress routing and TLS configuration.

Capture failures in the incident tracker before retrying onboarding.

## Rollback Procedures

Trigger the rollback flow if onboarding fails after registry changes, if compliance asserts new regressions, or if stakeholders request a revert during change control. Capture the current state before executing the steps below.

1. **Freeze onboarding activity**
   - Announce the rollback in the Ops channel and pause any client credential distribution.
   - Export the current `MCP_CLIENTS` JSON and compliance CLI logs for audit.
2. **Revert registry and environment variables**
   - Remove the newly added client entry from `MCP_CLIENTS` and restore prior values from version control or the secrets manager snapshot.
   - Reset `BETTER_AUTH_TRUSTED_ORIGINS` and any tenant-specific secrets introduced during onboarding.
   - For emergency disablement, set `MCP_CLIENTS` to the last known good state and redeploy without waiting for pipeline promotion (hotfix path).
3. **Revoke credentials**
   - Rotate or delete `MCP_COMPLIANCE_SECRET_<CLIENT>` and any issued client secrets stored alongside the onboarding package.
   - Invalidate external secrets by revoking access in the tenant’s secret manager or revoking issued tokens via `/oauth2/revoke`.
4. **Redeploy and flush caches**
   - Promote the reverted environment values.
   - Hit the discovery endpoints listed earlier to refresh caches and confirm the client is removed.
5. **Validate post-rollback state**
   - Run `pnpm mcp:register -- --base-url=<environment>` to confirm the client no longer appears.
   - Execute `pnpm mcp:compliance -- --base-url=<environment>`; the command should succeed or report “No servers registered” if you intentionally cleared the registry.
6. **Communicate closure**
   - Record the rollback decision in your change log and capture any follow-up tasks for future sprints.

Document the outcome in your personal tracker, noting which environment variables changed and which secrets were rotated.

Maintain this runbook alongside the integration checklist. Whenever the checklist changes, review this runbook to ensure both documents stay consistent.
