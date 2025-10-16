# API Contracts

## Public JSON Endpoints

| Method | Path | Authentication | Description |
| --- | --- | --- | --- |
| GET | `/.well-known/oauth-authorization-server` | None | Returns OAuth discovery metadata (issuer, JWKS, token endpoints). |
| GET | `/.well-known/oauth-protected-resource` | None | Returns MCP protected resource metadata (resource URI, scopes). |

## Authenticated Flows

- `POST /api/auth/oauth2/consent`
  - Input form fields: `consent_code` (string), `accept` (`true`/`false`).
  - Handled by Better Auth; response depends on consent decision.

## HTML Customization Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/login` (configurable) | Render customizable login UI placeholder with suggestions. |
| GET | `/consent` (configurable) | Render consent approval UI; posts back to `/api/auth/oauth2/consent`. |

## Better Auth Proxy Routes

All other requests under `/api/auth/**` are forwarded to the Better Auth handler created in `src/auth.ts`. Request/response schemas follow Better Auth documentation.
