# Data Models

## Storage Engine

- SQLite database file: `better-auth.sqlite`
- Managed by Better Auth through either `better-sqlite3` (default) or `node:sqlite` driver.

## Schema Overview

Better Auth manages its own tables (users, sessions, clients, tokens). Schema is applied/migrated via `pnpm auth:migrate`.

## Environment Controls

| Variable | Purpose |
| --- | --- |
| `BETTER_AUTH_DB_DRIVER` | Selects SQLite driver (`better-sqlite3` or `node`). |
| `BETTER_AUTH_SECRET` | JWT / session signing secret (required). |

## Migration Workflow

1. Configure environment variables.
2. Run `pnpm auth:migrate` to apply migrations.
3. Use `pnpm auth:generate` if schema artifacts are needed.

SQLite file is created in the project root; ensure deployment environments have writable storage or update configuration to use an alternative driver.
