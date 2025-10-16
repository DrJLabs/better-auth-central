# ChatGPT Todo Integration Checklist

This doc tracks the configuration work required in the central Better Auth server so the `chatgpt-todo` MCP client can rely on it for session gating and OAuth discovery.

## 1. CORS & Trusted Origins
- Add `cors()` (or equivalent) to `src/server.ts` so `https://auth.onemainarmy.com` allows credentialed requests from:
  - `http://localhost:5173` (local Vite dev)
  - `http://localhost:3000` (local Express wrapper)
  - `https://todo.onemainarmy.com` (production MCP transport)
- Mirror the same list in Better Auth config via `trustedOrigins` to ensure token issuance honours those origins.

## 2. Cross-Origin Cookies
- Enable `advanced.crossOriginCookies` (or set `useSecureCookies + crossSubDomainCookies`) in `src/auth.ts` so session cookies survive across domains when the client sits on a different host.
- In production enforce `Secure` + `SameSite=None`; document that local development may rely on Better Auth’s localhost overrides.

## 3. Session Introspection Endpoint
- Keep `/api/auth/session` exposed; `chatgpt-todo` uses it for lightweight session validation. Add a short note in the README explaining the endpoint is intentionally public for first-party apps.

## 4. Discovery Metadata
- Continue serving:
  - `/.well-known/oauth-authorization-server`
  - `/.well-known/oauth-protected-resource`
- Add a smoke test target for `https://auth.onemainarmy.com/.well-known/oauth-protected-resource` (mirroring the local script) so we spot drift before clients do.

## 5. Login & Consent UX
- Replace the placeholder HTML in `createApp` with production pages before rollout. The ChatGPT client expects Google SSO to initiate at `/api/auth/sign-in/social?provider=google` and consent to post back to `/api/auth/oauth2/consent`.

## 6. Environment Contract
- Ensure `.env` includes:
  - `BETTER_AUTH_URL=https://auth.onemainarmy.com`
  - `MCP_RESOURCE=https://auth.onemainarmy.com`
  - `PORT=3000` (or Traefik override)
- Document any reverse proxy headers (e.g., `X-Forwarded-*`) so downstream apps know cookies will be marked `secure` when traffic terminates at the proxy.

## 7. Future Enhancements
- Consider exporting a lightweight package (or REST helper) that wraps `auth.api.getMcpSession` for external services so they can avoid manual `fetch` calls.
- Publish a changelog entry whenever scopes or discovery URLs move; the client guide depends on these remaining stable.

