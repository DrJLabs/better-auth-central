# Development Guide

## Prerequisites

- Node.js 20+
- pnpm 10+
- SQLite available on the host

## Environment Setup

1. Copy `.env.example` to `.env` and populate secrets:
   - `BETTER_AUTH_SECRET`
   - Optional: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_URL`, `MCP_RESOURCE`
2. Install dependencies with `pnpm install`.
3. Create the SQLite database by running `pnpm auth:migrate` (Better Auth CLI).

## Common Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Launches `tsx` watcher to rebuild on change and run the server in development mode. |
| `pnpm build` | Compiles TypeScript sources to `dist/` using `tsc`. |
| `pnpm start` | Runs the compiled JavaScript (`node dist/server.js`). |
| `pnpm test` | Executes Node's built-in test runner over compiled output. |
| `pnpm smoke:discovery` | Verifies discovery endpoints respond with valid metadata. |
| `pnpm auth:generate` | Generates Better Auth artifacts (schemas, types). |
| `pnpm auth:migrate` | Applies Better Auth migrations to SQLite. |

## Testing Workflow

1. Run `pnpm build` to ensure TypeScript emits latest JS.
2. Execute `pnpm test` to run integration tests with Supertest.
3. Optionally run `pnpm smoke:discovery` to confirm runtime endpoints.

## Debug Tips

- Set `DEBUG=better-auth:*` to increase Better Auth logging (if supported).
- Override `BETTER_AUTH_DB_DRIVER=node` during tests to avoid file-based locking.
- `createApp` accepts `authInstance`, `loginPath`, and `consentPath` overrides for dependency injection during testing.
