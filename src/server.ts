import express, { type NextFunction, type Request, type Response } from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth";

const app = express();
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const authHandler = toNodeHandler(auth);

const loginPath = process.env.OIDC_LOGIN_PATH ?? "/login";
const consentPath = process.env.OIDC_CONSENT_PATH ?? "/consent";

const escapeHtml = (unsafe: string) =>
  unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const handleAuth = (req: Request, res: Response, next: NextFunction) => {
  req.url = req.originalUrl;
  authHandler(req, res).catch(next);
};

app.all("/api/auth", handleAuth);
app.all("/api/auth/*", handleAuth);

app.get("/.well-known/oauth-authorization-server", async (_req, res, next) => {
  try {
    const metadata = await auth.api.getMcpOAuthConfig();
    res.json(metadata);
  } catch (error) {
    next(error);
  }
});

app.get("/.well-known/oauth-protected-resource", async (_req, res, next) => {
  try {
    const metadata = await auth.api.getMCPProtectedResource();
    res.json(metadata);
  } catch (error) {
    next(error);
  }
});

app.get(loginPath, (_req, res) => {
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
        <p>This placeholder route confirms that <code>${escapeHtml(loginPath)}</code> is reachable. Replace it with your own UI to collect credentials or redirect users to social login flows.</p>
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
  const params = new URLSearchParams(
    Object.entries(req.query).flatMap(([key, rawValue]) => {
      if (Array.isArray(rawValue)) {
        return rawValue
          .filter((value): value is string => typeof value === "string")
          .map((value) => [key, value] as [string, string]);
      }

      if (
        rawValue === undefined ||
        typeof rawValue !== "string"
      ) {
        return [] as [string, string][];
      }

      return [[key, rawValue]];
    })
  );

  const consentCode = params.get("consent_code") ?? "";
  const clientId = params.get("client_id") ?? "";
  const scope = params.get("scope") ?? "";

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
          button[type="submit"] { background: #2563eb; color: #fff; }
          button[type="button"] { background: #e5e7eb; }
        </style>
      </head>
      <body>
        <h1>Review consent for <code>${escapeHtml(clientId)}</code></h1>
        <p>The client is requesting the following scopes:</p>
        <p><code>${escapeHtml(scope || "(none provided)")}</code></p>
        <p>This placeholder page demonstrates where you can collect user confirmation before posting to <code>/api/auth/oauth2/consent</code>.</p>
        <form id="consent-form" method="post" action="/api/auth/oauth2/consent">
          <input type="hidden" name="consent_code" value="${escapeHtml(consentCode)}" />
          <input type="hidden" name="accept" value="true" />
          <button type="submit">Allow</button>
          <button type="button" onclick="window.history.back()">Deny</button>
        </form>
        <script>
          document.getElementById('consent-form').addEventListener('submit', (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            fetch(form.action, {
              method: 'POST',
              body: new URLSearchParams(data as any),
            }).then((response) => {
              if (response.ok) {
                window.close();
              } else {
                console.error('Consent submission failed', response.status, response.statusText);
                alert('Consent submission failed: ' + response.status + ' ' + response.statusText);
              }
            }).catch((error) => {
              console.error('Network error during consent submission', error);
              alert('Network error. Please check your connection and try again.');
            });
          });
        </script>
      </body>
    </html>`);
});

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`Better Auth server listening on http://localhost:${port}`);
});
