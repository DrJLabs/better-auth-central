# Component Inventory

| Component | Location | Type | Notes |
| --- | --- | --- | --- |
| `createApp` | `src/server.ts` | Express factory | Constructs the HTTP server, wires Better Auth handler, and attaches routes. |
| `handleAuth` middleware | `src/server.ts` | Middleware | Adapts Better Auth handler to Express, ensuring original URL is preserved. |
| Login route | `src/server.ts` | HTML endpoint | Outputs customizable login placeholder with safe HTML escaping. |
| Consent route | `src/server.ts` | HTML endpoint | Collects consent decisions; uses `buildParams` helper for sanitization. |
| `.well-known` endpoints | `src/server.ts` | API endpoint | Proxy Better Auth discovery/protected resource metadata. |
| `auth` instance | `src/auth.ts` | Service singleton | Configures Better Auth with database, secrets, plugins, and optional Google provider. |
| `closeAuth` | `src/auth.ts` | Resource cleanup | Closes SQLite connection when shutting down tests or application. |
| `server.test.mjs` | `src/__tests__/` | Integration test | Verifies JSON endpoints and HTML escaping through Supertest. |
