# Better Auth Central Server

This project provisions a standalone Better Auth server backed by SQLite and prepared for Google as an identity provider. It is intended to run as a centralized authentication service that other applications can call via REST.

## Prerequisites

- Node.js 20 or later (ships with `corepack`, which provides `pnpm`)
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
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: obtained from Google Cloud Console. Leave empty initially if you plan to wire them in later.
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

## Production build

```bash
pnpm build
BETTER_AUTH_SECRET=your-secret pnpm start
```

## Project Structure

- `src/auth.ts` – Better Auth configuration (SQLite database, Google provider stub).
- `src/server.ts` – Express server that forwards `/api/auth` traffic to Better Auth.
- `better-auth.sqlite` – SQLite database file (created on first run).

## Next Steps

- Return to the Google Cloud Console once ready to register OAuth credentials, then populate `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- Configure additional providers or auth flows by extending `src/auth.ts`.
- Integrate this server with your MCP client or other services by pointing them at the `/api/auth` endpoints.
