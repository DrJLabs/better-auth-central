# Architecture Overview

## Executive Summary

The better-auth-server repository exposes a standalone OAuth-ready authentication service. It wraps the Better Auth framework in an Express 5 application and provides discovery endpoints, HTML login/consent placeholders, and MCP-compatible metadata for downstream agents.

## Technology Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Language | TypeScript (Node.js) | Compiled via `tsc` to CommonJS output in `dist/`. |
| Framework | Express 5 | Hosts REST endpoints and HTML routes. |
| Authentication | Better Auth + plugins (`jwt`, `oidcProvider`, `mcp`) | Drives OAuth/OIDC flows, JWT issuance, and MCP integration. |
| Database | SQLite (`better-sqlite3` or `node:sqlite`) | Stores identity data; driver controlled via `BETTER_AUTH_DB_DRIVER`. |
| Testing | Node test runner + Supertest | Exercises HTTP endpoints and escaping logic. |

## Architecture Pattern

This service is a single-process backend monolith. Express handles HTTP requests while Better Auth manages identity workflows. The Better Auth instance is constructed once (singleton) in `src/auth.ts` and injected into the Express app.

## Data Architecture

- SQLite database file resolved to `<repo>/better-auth.sqlite`.
- Driver choice: `better-sqlite3` (default) or `node:sqlite`.
- Database connection lifecycle managed by `closeAuth()`.

## API Design

- `GET /.well-known/oauth-authorization-server` → Discovery metadata via `auth.api.getMcpOAuthConfig()`.
- `GET /.well-known/oauth-protected-resource` → Protected resource description via `auth.api.getMCPProtectedResource()`.
- `POST /api/auth/*` → Routed to Better Auth handler (`toNodeHandler`).
- HTML placeholders for `/login` and `/consent` demonstrating customization points.

## Component Overview

- `createApp()` constructs Express app, configures middleware, and registers routes.
- HTML route handlers sanitize user inputs via `escapeHtml` and `buildParams` helpers.
- Tests in `src/__tests__/server.test.mjs` verify JSON endpoints and escaping behavior.

## Source Tree Summary

```
src/
├── auth.ts          # Better Auth initialization and configuration
├── server.ts        # Express app factory and HTTP routes
└── __tests__/       # Server endpoint tests (Node test runner + Supertest)
```

## Development Workflow

- `pnpm dev` launches `tsx watch` for live reload.
- `pnpm build` runs TypeScript compiler (`tsconfig.json`).
- `pnpm test` executes Node test runner against compiled output.
- `pnpm auth:generate` / `pnpm auth:migrate` execute Better Auth CLI utilities.

## Deployment Architecture

- `pnpm build` followed by `pnpm start` (runs `node dist/server.js`).
- Requires environment variables: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, optional Google OAuth credentials, MCP resource overrides, and DB driver selection.
- Behind a reverse proxy, Express trusts the first proxy hop to honour TLS (`app.set("trust proxy", 1)`).

## Testing Strategy

- Unit/integration tests in `src/__tests__/server.test.mjs` exercise discovery endpoints and HTML escaping.
- Supertest ensures Express routes respond as expected without launching a real server.
- Additional smoke script `pnpm smoke:discovery` validates discovery metadata runtime.
