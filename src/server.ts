import express, { type Application, type NextFunction, type Request, type Response } from "express";
import { toNodeHandler } from "better-auth/node";
import type { Server } from "node:http";
import { auth, closeAuth } from "./auth";

type AuthLike = typeof auth;

export interface CreateAppOptions {
  authInstance?: AuthLike;
  loginPath?: string;
  consentPath?: string;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildParams = (query: Request["query"]): URLSearchParams => {
  const params = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(query)) {
    if (rawValue == null) {
      continue;
    }

    if (Array.isArray(rawValue)) {
      for (const value of rawValue) {
        if (value != null) {
          params.append(key, String(value));
        }
      }
      continue;
    }

    params.append(key, String(rawValue));
  }

  return params;
};

export const createApp = (options: CreateAppOptions = {}): Application => {
  const app = express();

  const authInstance = options.authInstance ?? auth;
  const authApi = authInstance.api;
  const loginPath = options.loginPath ?? process.env.OIDC_LOGIN_PATH ?? "/login";
  const consentPath = options.consentPath ?? process.env.OIDC_CONSENT_PATH ?? "/consent";

  const authHandler = toNodeHandler(authInstance);

  const handleAuth = (req: Request, res: Response, next: NextFunction) => {
    req.url = req.originalUrl;
    authHandler(req, res).catch(next);
  };

  app.all("/api/auth", handleAuth);
  app.all("/api/auth/*", handleAuth);

  app.get("/.well-known/oauth-authorization-server", async (_req, res, next) => {
    try {
      const metadata = await authApi.getMcpOAuthConfig();
      res.json(metadata);
    } catch (error) {
      next(error);
    }
  });

  app.get("/.well-known/oauth-protected-resource", async (_req, res, next) => {
    try {
      const metadata = await authApi.getMCPProtectedResource();
      res.json(metadata);
    } catch (error) {
      next(error);
    }
  });

  app.get(loginPath, (_req, res) => {
    const escapedPath = escapeHtml(loginPath);

    res.type("html").send(`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Sign In</title>
        <style>
          body { font-family: sans-serif; margin: 3rem auto; max-width: 40rem; line-height: 1.6; }
          h1 { font-size: 1.75rem; }
          code { background: #f3f4f6; padding: 0.2rem 0.4rem; border-radius: 0.25rem; }
          .hint { background: #fdf2f8; border-left: 4px solid #db2777; padding: 1rem; }
        </style>
      </head>
      <body>
        <h1>Customize Your Login Experience</h1>
        <p>This placeholder route confirms that <code>${escapedPath}</code> is reachable. Replace it with your own UI to collect credentials or redirect users to social login flows.</p>
        <div class="hint">
          <p>Example enhancements you might add:</p>
          <ul>
            <li>Trigger the Google social login at <code>/api/auth/sign-in/social?provider=google</code>.</li>
            <li>Render your workspace single sign-on button.</li>
            <li>Embed a custom form that calls Better Auth email/password endpoints.</li>
          </ul>
        </div>
      </body>
    </html>`);
  });

  app.get(consentPath, (req, res) => {
    const params = buildParams(req.query);

    const consentCode = params.get("consent_code") ?? "";
    const clientId = params.get("client_id") ?? "";
    const scope = params.get("scope") ?? "";

    const escapedConsentCode = escapeHtml(consentCode);
    const escapedClientId = escapeHtml(clientId);
    const escapedScope = escapeHtml(scope || "(none provided)");

    res.type("html").send(`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Consent Required</title>
        <style>
          body { font-family: sans-serif; margin: 3rem auto; max-width: 40rem; line-height: 1.6; }
          h1 { font-size: 1.75rem; }
          code { background: #f3f4f6; padding: 0.2rem 0.4rem; border-radius: 0.25rem; }
          form { margin-top: 1.5rem; display: flex; gap: 1rem; }
          button { padding: 0.65rem 1.5rem; border-radius: 0.375rem; border: none; cursor: pointer; }
          button[data-accept="true"] { background: #2563eb; color: #fff; }
          button[data-accept="false"] { background: #e5e7eb; }
        </style>
      </head>
      <body>
        <h1>Review consent for <code>${escapedClientId}</code></h1>
        <p>The client is requesting the following scopes:</p>
        <p><code>${escapedScope}</code></p>
        <p>This placeholder page demonstrates where you can collect user confirmation before posting to <code>/api/auth/oauth2/consent</code>.</p>
        <form id="consent-form" method="post" action="/api/auth/oauth2/consent">
          <input type="hidden" name="consent_code" value="${escapedConsentCode}" />
          <input id="consent-accept" type="hidden" name="accept" value="true" />
          <button type="button" data-accept="true">Allow</button>
          <button type="button" data-accept="false">Deny</button>
        </form>
        <script>
          (function () {
            const form = document.getElementById('consent-form');
            const acceptInput = document.getElementById('consent-accept');
            if (!form || !acceptInput) {
              return;
            }

            form.addEventListener('click', (event) => {
              const target = event.target;
              if (!(target instanceof HTMLElement)) {
                return;
              }

              const button = target.closest('button[data-accept]');
              if (!button) {
                return;
              }

              event.preventDefault();
              acceptInput.value = button.getAttribute('data-accept') === 'false' ? 'false' : 'true';
              const data = new FormData(form);

              fetch(form.action, {
                method: 'POST',
                body: new URLSearchParams(data),
              })
                .then((response) => {
                  if (response.ok) {
                    window.close();
                    return;
                  }

                  console.error('Consent submission failed', response.status, response.statusText);
                  alert('Consent submission failed: ' + response.status + ' ' + response.statusText);
                })
                .catch((error) => {
                  console.error('Network error during consent submission', error);
                  alert('Network error. Please check your connection and try again.');
                });
            });
          })();
        </script>
      </body>
    </html>`);
  });

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  return app;
};

type StartedServer = Server & { shutdown: (signal?: NodeJS.Signals) => void };

export const startServer = (): StartedServer => {
  const app = createApp();
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  const server = app.listen(port, () => {
    console.log(`Better Auth server listening on http://localhost:${port}`);
  });

  let shuttingDown = false;
  let authClosed = false;

  const closeAuthResources = () => {
    if (authClosed) {
      return;
    }

    try {
      closeAuth();
      authClosed = true;
    } catch (error) {
      console.error("Error closing Better Auth resources", error);
      if (process.exitCode === undefined) {
        process.exitCode = 1;
      }
    }
  };

  const shutdown = (signal?: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    if (signal) {
      console.log(`Received ${signal}, shutting down gracefully...`);
    }

    server.close((error) => {
      if (error) {
        console.error("Error closing HTTP server", error);
        if (process.exitCode === undefined) {
          process.exitCode = 1;
        }
      }

      closeAuthResources();

      if (signal) {
        process.exit();
      }
    });
  };

  server.on("close", closeAuthResources);

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => shutdown(signal));
  }

  return Object.assign(server as StartedServer, { shutdown });
};

if (require.main === module) {
  startServer();
}
