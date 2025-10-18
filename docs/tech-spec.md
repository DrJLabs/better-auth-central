# better-auth-central - Technical Specification

**Author:** drj
**Date:** 2025-10-16
**Project Level:** 0 (single atomic change)
**Project Type:** backend
**Development Context:** brownfield – productionises the central auth server so ChatGPT Todo MCP client can rely on it

---

## Source Tree Structure

- `package.json` / `pnpm-lock.yaml` — add runtime dependencies `cors@2.8.5` and `tldts@7.0.17`.
- `src/config/origins.ts` (new) — export `DEFAULT_ALLOWED_ORIGINS` list and `resolveAllowedOrigins()` helper that merges defaults with `BETTER_AUTH_TRUSTED_ORIGINS`.
- `src/ui/loginPage.ts` (new) — implement `renderLoginPage({{ googleSignInUrl, baseUrl }})` returning branded HTML.
- `src/ui/consentPage.ts` (new) — implement `renderConsentPage({ consentCode, clientId, scopeList, submitUrl })` outputting consent UI.
- `src/server.ts` — wire CORS middleware, reject unknown origins, serve the new templates, keep `app.set('trust proxy', 1)`.
- `src/auth.ts` — configure Better Auth `trustedOrigins`, secure cookie attributes, and cross-sub-domain cookies based on `BETTER_AUTH_URL`.
- `src/__tests__/server.test.mjs` — add integration tests for CORS headers, rejection paths, cookie attributes, and login/consent markup snapshots.
- `scripts/check-discovery.mjs` — accept `--base-url` argument and log the URL under test.
- `.env.example` / `README.md` — document required environment variables and Traefik expectations.

---

## Technical Approach

Use a single allowlist for origins consumed by both Express CORS middleware and Better Auth `trustedOrigins`. Enforce secure, cross-domain cookies by enabling Better Auth advanced settings, deriving the registrable domain from `BETTER_AUTH_URL`, and allowing operators to override it via `BETTER_AUTH_COOKIE_DOMAIN`. Replace placeholder login/consent pages with reusable templates that surface Google SSO and consent info. Extend the discovery smoke script so CI/operators can validate the production endpoint. All changes stay within the existing Express + Better Auth stack; no new services are introduced.

---

## Implementation Stack

- Node.js 20.x runtime (existing project standard)
- Express 5.1.0
- `cors` 2.8.5
- `tldts` 7.0.17
- Better Auth 1.3.27 (`jwt`, `oidcProvider`, `mcp` plugins)
- TypeScript 5.9.3
- Supertest 7.1.4 + Node test runner

---

## Technical Details

- `DEFAULT_ALLOWED_ORIGINS` = [`http://localhost:5173`, `http://localhost:3000`, `https://todo.onemainarmy.com`, `https://auth.onemainarmy.com`]. `resolveAllowedOrigins()` reads `BETTER_AUTH_TRUSTED_ORIGINS` (comma-separated), trims, deduplicates, and throws on empty values.
- Register `cors` middleware with `{ origin: allowlistFn, credentials: true, methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"], allowedHeaders: ["Content-Type","Authorization","X-Requested-With"], exposedHeaders: ["Set-Cookie"], preflight:`false` } so preflight requests are answered automatically.
- Add a global guard that rejects any request carrying a disallowed `Origin`, plus an `/api/auth`-scoped guard that requires an allowlisted `Origin` header (returning 403 JSON `{ "error": "origin_not_allowed" }` when missing or invalid). Public `.well-known/*` discovery endpoints, `/healthz`, and HTML entry points accept browser navigations without an `Origin` header, while rejections continue to log the offending value.
- In `auth.ts`, derive hostname from `new URL(baseURL).hostname`. Configure Better Auth: `trustedOrigins = resolveAllowedOrigins()`, `advanced.useSecureCookies = baseURL.startswith('https')`, `advanced.cookieAttributes = {{ sameSite: 'none', secure: baseURL.startswith('https'), httpOnly: true, domain: BETTER_AUTH_COOKIE_DOMAIN or derived registrable domain, path: '/' }}`, `advanced.crossSubDomainCookies = {{ enabled: True, domain: BETTER_AUTH_COOKIE_DOMAIN or derived registrable domain }}`; omit the domain attribute when no registrable domain can be inferred so development cookies remain host-scoped.
- `renderLoginPage` must show brand header, explanation, and button linking to `/api/auth/sign-in/social?provider=google`; degrade with informational banner if Google credentials missing.
- `renderConsentPage` must list client ID, requested scopes (bullet list), submit form via POST to `/api/auth/oauth2/consent`, and allow deny/accept actions.
- Extend discovery script CLI parsing: `node scripts/check-discovery.mjs --base-url=https://auth.onemainarmy.com`; default still local. Print base URL at start.
- Update docs to cover new env vars (`BETTER_AUTH_URL`, `MCP_RESOURCE`, `BETTER_AUTH_TRUSTED_ORIGINS`, `BETTER_AUTH_COOKIE_DOMAIN`) and note Traefik must forward `X-Forwarded-*`.

---

## Development Setup

1. `pnpm add cors` and reinstall dependencies.
2. Copy `.env.example` → `.env`; provide `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `MCP_RESOURCE`, `BETTER_AUTH_TRUSTED_ORIGINS`, and (for production HTTPS) `BETTER_AUTH_COOKIE_DOMAIN`.
3. For local dev: `BETTER_AUTH_URL=http://127.0.0.1:3000`; trusted origins left empty (defaults cover localhost).
4. Run `pnpm dev`; ensure ChatGPT Todo MCP client points at matching base URL.

---

## Implementation Guide

1. Create `src/config/origins.ts` with default allowlist, env override parser, and validation.
2. Install/configure `cors` middleware in `src/server.ts`, relying on its built-in preflight handling; keep `trust proxy` call.
3. Add origin guards so any request with a disallowed origin is rejected and `/api/auth` requests require an allowlisted `Origin` header.
4. Implement `renderLoginPage` and `renderConsentPage` templates under `src/ui` and update `/login` and `/consent` handlers to use them.
5. Update `src/auth.ts` to import `resolveAllowedOrigins()` and set Better Auth trusted origins plus secure cookie options derived from `BETTER_AUTH_URL`, honouring `BETTER_AUTH_COOKIE_DOMAIN` when provided and falling back to the registrable domain.
6. Enhance `scripts/check-discovery.mjs` with `--base-url` flag and logging.
7. Update `.env.example` and README with new environment requirements and deployment guidance.
8. Add integration tests verifying CORS headers, rejection behaviour, cookie attributes, and login/consent markup.

---

## Testing Approach

- Automated: `pnpm test` – new Supertest cases confirming CORS behaviour, cookie flags, and login/consent HTML.
- Manual: Exercise ChatGPT Todo MCP client against local and production hosts to validate login → consent → session introspection.
- Smoke: `node scripts/check-discovery.mjs` locally and `node scripts/check-discovery.mjs --base-url=https://auth.onemainarmy.com` post-deploy; both must pass.

---

## Deployment Strategy

1. Commit changes, run `pnpm build`, `pnpm test`.
2. Deploy updated service via existing pipeline; ensure Traefik still forwards `X-Forwarded-*`.
3. Post-deploy, execute discovery smoke test against production URL.
4. Validate Google SSO flow via Todo MCP client in production.
5. Monitor logs for rejected origins or cookie warnings; adjust `BETTER_AUTH_TRUSTED_ORIGINS` or config as needed.
