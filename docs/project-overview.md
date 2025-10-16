# Project Overview

## Purpose

better-auth-server packages the Better Auth framework into a deployable Express backend that exposes OAuth discovery endpoints, HTML customization points, and MCP metadata. It is intended as a starting point for teams adopting Better Auth in a standalone service.

## Key Facts

| Item | Details |
| --- | --- |
| Repository Type | Monolith backend service |
| Primary Language | TypeScript (Node.js 20+) |
| Main Frameworks | Express 5, Better Auth plugins (jwt, oidcProvider, mcp) |
| Persistence | SQLite database stored as `better-auth.sqlite` |
| Tests | Node test runner + Supertest (`pnpm test`) |

## Highlights

- Ready-made OAuth/OIDC discovery and protected resource endpoints.
- HTML routes (`/login`, `/consent`) meant to be replaced with custom UI while maintaining secure defaults.
- Supports Google social login when credentials are present.
- Environment-driven configuration keeps deployment flexible.

## Next Steps

1. Configure secrets in `.env` (`BETTER_AUTH_SECRET`, Google client values, etc.).
2. Extend the Express app with any domain-specific API endpoints.
3. Replace placeholder HTML screens with production-ready experiences.
4. Integrate with desired MCP clients via the provided metadata endpoints.
