# Todo MCP Deployment Notes

## Local Service
- Server binary lives in `~/projects/chatgpt-todo-app/server`
- Listen port: `25010` (override via `PORT` env)

## Traefik
- Added dynamic config `/etc/traefik/dynamic/todo.yml`
- Router `todo-https` listens on `websecure` for `todo.onemainarmy.com`
- Forwards to service `todo-svc` → `http://127.0.0.1:25010`
- CORS middleware `todo-cors` allows `todo.onemainarmy.com`, `auth.onemainarmy.com`, and localhost dev
- Applies existing `sec-headers` middleware for HSTS
- TLS cert from `/etc/traefik/dynamic/tls.yml` must cover `todo.onemainarmy.com`

## Systemd
- Traefik reloaded via `sudo systemctl restart traefik`
- Check logs with `journalctl -u traefik --reverse`

## Next Steps
1. Start the MCP server: `cd ~/projects/chatgpt-todo-app/server && pnpm install && PORT=25010 pnpm start`
2. Verify Traefik route: `curl -I https://todo.onemainarmy.com/mcp-metadata`
3. Fix Better Auth discovery 502s so metadata relay succeeds
4. Ensure Better Auth trusted origins include `https://todo.onemainarmy.com`
