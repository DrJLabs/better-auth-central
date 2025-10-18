# External Discovery Outage

The public discovery endpoints behind `https://auth.onemainarmy.com` are currently returning HTTP 502 from Cloudflare:

- `/.well-known/oauth-authorization-server`
- `/.well-known/oauth-protected-resource`
- `/mcp`

Private `/api/auth/*` routes still respond, so the Better Auth instance itself is alive, but the reverse proxy or CDN layer handling the `.well-known` paths looks misconfigured. Until those 502s are resolved, downstream MCP clients (like `chatgpt-todo`) cannot bootstrap because they rely on those discovery documents.

## Action items
1. Inspect the Cloudflare / Traefik configuration for `auth.onemainarmy.com` and restore routing for the discovery endpoints.
2. Re-run the discovery smoke test (`pnpm smoke:discovery`) once the issue is fixed to confirm the responses include `issuer`, `authorization_endpoint`, and `resource`.
3. Notify downstream teams when the endpoints return 200s so they can resume integration.

Quick verify:
```bash
curl -fsSI https://auth.onemainarmy.com/.well-known/oauth-authorization-server
curl -fsSI https://auth.onemainarmy.com/.well-known/oauth-protected-resource
curl -fsSI https://auth.onemainarmy.com/mcp
```
