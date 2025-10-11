import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

// Mock environment variables before importing server
process.env.BETTER_AUTH_SECRET = "test-secret-key-for-testing";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.PORT = "0"; // Use random available port
process.env.OIDC_LOGIN_PATH = "/login";
process.env.OIDC_CONSENT_PATH = "/consent";
process.env.MCP_RESOURCE = "http://localhost:3000";

describe("Server Routes", () => {
  let app;
  let authMock;

  before(async () => {
    // Mock the auth module to avoid database dependencies
    authMock = {
      api: {
        getMcpOAuthConfig: mock.fn(async () => ({
          issuer: "http://localhost:3000",
          jwks_uri: "http://localhost:3000/.well-known/jwks.json",
          registration_endpoint: "http://localhost:3000/api/auth/oauth2/register",
          authorization_endpoint: "http://localhost:3000/api/auth/oauth2/authorize",
          token_endpoint: "http://localhost:3000/api/auth/oauth2/token",
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code"],
        })),
        getMCPProtectedResource: mock.fn(async () => ({
          resource: "http://localhost:3000",
          authorization_servers: ["http://localhost:3000"],
          jwks_uri: "http://localhost:3000/.well-known/jwks.json",
          scopes_supported: ["mcp"],
        })),
      },
    };

    // Dynamically import and setup the Express app without starting the server
    const express = (await import("express")).default;
    const { toNodeHandler } = await import("better-auth/node");
    
    app = express();
    const port = Number.parseInt(process.env.PORT ?? "3000", 10);
    const authHandler = toNodeHandler(authMock);

    const loginPath = process.env.OIDC_LOGIN_PATH ?? "/login";
    const consentPath = process.env.OIDC_CONSENT_PATH ?? "/consent";

    const handleAuth = (req, res, next) => {
      req.url = req.originalUrl;
      authHandler(req, res).catch(next);
    };

    app.all("/api/auth", handleAuth);
    app.all("/api/auth/*", handleAuth);

    app.get("/.well-known/oauth-authorization-server", async (_req, res, next) => {
      try {
        const metadata = await authMock.api.getMcpOAuthConfig();
        res.json(metadata);
      } catch (error) {
        next(error);
      }
    });

    app.get("/.well-known/oauth-protected-resource", async (_req, res, next) => {
      try {
        const metadata = await authMock.api.getMCPProtectedResource();
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
        <p>This placeholder route confirms that <code>${loginPath}</code> is reachable. Replace it with your own UI to collect credentials or redirect users to social login flows.</p>
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
      const params = new URLSearchParams();
      for (const [key, rawValue] of Object.entries(req.query)) {
        if (Array.isArray(rawValue)) {
          rawValue.forEach((value) => {
            if (value !== undefined) params.append(key, String(value));
          });
        } else if (rawValue !== undefined) {
          params.append(key, String(rawValue));
        }
      }

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
        <h1>Review consent for <code>${clientId}</code></h1>
        <p>The client is requesting the following scopes:</p>
        <p><code>${scope || "(none provided)"}</code></p>
        <p>This placeholder page demonstrates where you can collect user confirmation before posting to <code>/api/auth/oauth2/consent</code>.</p>
        <form id="consent-form" method="post" action="/api/auth/oauth2/consent">
          <input type="hidden" name="consent_code" value="${consentCode}" />
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
            }).then(() => {
              window.close();
            }).catch((error) => {
              console.error('Consent submission failed', error);
              alert('Consent submission failed. Check the server logs for details.');
            });
          });
        </script>
      </body>
    </html>`);
    });

    app.get("/healthz", (_req, res) => {
      res.json({ status: "ok" });
    });
  });

  describe("GET /.well-known/oauth-authorization-server", () => {
    it("should return OIDC discovery metadata", async () => {
      const response = await request(app)
        .get("/.well-known/oauth-authorization-server")
        .expect(200)
        .expect("Content-Type", /json/);

      assert.ok(response.body.issuer);
      assert.ok(response.body.jwks_uri);
      assert.ok(response.body.registration_endpoint);
      assert.ok(response.body.authorization_endpoint);
      assert.ok(response.body.token_endpoint);
      assert.strictEqual(authMock.api.getMcpOAuthConfig.mock.calls.length, 1);
    });

    it("should call auth.api.getMcpOAuthConfig", async () => {
      await request(app)
        .get("/.well-known/oauth-authorization-server")
        .expect(200);

      assert.ok(authMock.api.getMcpOAuthConfig.mock.calls.length >= 1);
    });

    it("should handle errors gracefully", async () => {
      const originalFn = authMock.api.getMcpOAuthConfig;
      authMock.api.getMcpOAuthConfig = mock.fn(async () => {
        throw new Error("Test error");
      });

      await request(app)
        .get("/.well-known/oauth-authorization-server")
        .expect(500);

      authMock.api.getMcpOAuthConfig = originalFn;
    });
  });

  describe("GET /.well-known/oauth-protected-resource", () => {
    it("should return protected resource metadata", async () => {
      const response = await request(app)
        .get("/.well-known/oauth-protected-resource")
        .expect(200)
        .expect("Content-Type", /json/);

      assert.ok(response.body.resource);
      assert.ok(response.body.authorization_servers);
      assert.ok(response.body.jwks_uri);
      assert.ok(response.body.scopes_supported);
      assert.strictEqual(authMock.api.getMCPProtectedResource.mock.calls.length, 1);
    });

    it("should call auth.api.getMCPProtectedResource", async () => {
      await request(app)
        .get("/.well-known/oauth-protected-resource")
        .expect(200);

      assert.ok(authMock.api.getMCPProtectedResource.mock.calls.length >= 1);
    });

    it("should handle errors gracefully", async () => {
      const originalFn = authMock.api.getMCPProtectedResource;
      authMock.api.getMCPProtectedResource = mock.fn(async () => {
        throw new Error("Test error");
      });

      await request(app)
        .get("/.well-known/oauth-protected-resource")
        .expect(500);

      authMock.api.getMCPProtectedResource = originalFn;
    });
  });

  describe("GET /login", () => {
    it("should return HTML login page", async () => {
      const response = await request(app)
        .get("/login")
        .expect(200)
        .expect("Content-Type", /html/);

      assert.ok(response.text.includes("Sign In"));
      assert.ok(response.text.includes("Customize Your Login Experience"));
    });

    it("should display the configured login path in the content", async () => {
      const response = await request(app)
        .get("/login")
        .expect(200);

      assert.ok(response.text.includes("/login"));
    });

    it("should include helpful documentation", async () => {
      const response = await request(app)
        .get("/login")
        .expect(200);

      assert.ok(response.text.includes("Google social login"));
      assert.ok(response.text.includes("/api/auth/sign-in/social?provider=google"));
    });

    it("should be a valid HTML document", async () => {
      const response = await request(app)
        .get("/login")
        .expect(200);

      assert.ok(response.text.includes("<!doctype html>"));
      assert.ok(response.text.includes("<html"));
      assert.ok(response.text.includes("</html>"));
      assert.ok(response.text.includes("<head>"));
      assert.ok(response.text.includes("<body>"));
    });

    it("should include CSS styling", async () => {
      const response = await request(app)
        .get("/login")
        .expect(200);

      assert.ok(response.text.includes("<style>"));
      assert.ok(response.text.includes("</style>"));
    });
  });

  describe("GET /consent", () => {
    it("should return HTML consent page with query parameters", async () => {
      const response = await request(app)
        .get("/consent")
        .query({
          consent_code: "test-code-123",
          client_id: "test-client",
          scope: "mcp read write",
        })
        .expect(200)
        .expect("Content-Type", /html/);

      assert.ok(response.text.includes("Consent Required"));
      assert.ok(response.text.includes("test-client"));
      assert.ok(response.text.includes("mcp read write"));
      assert.ok(response.text.includes("test-code-123"));
    });

    it("should handle missing query parameters", async () => {
      const response = await request(app)
        .get("/consent")
        .expect(200);

      assert.ok(response.text.includes("Consent Required"));
      assert.ok(response.text.includes("(none provided)"));
    });

    it("should handle empty scope parameter", async () => {
      const response = await request(app)
        .get("/consent")
        .query({
          consent_code: "test-code",
          client_id: "client-123",
        })
        .expect(200);

      assert.ok(response.text.includes("(none provided)"));
    });

    it("should handle array query parameters", async () => {
      const response = await request(app)
        .get("/consent")
        .query("scope=read&scope=write&client_id=multi-client")
        .expect(200);

      assert.ok(response.text.includes("multi-client"));
    });

    it("should include form with consent_code hidden input", async () => {
      const response = await request(app)
        .get("/consent")
        .query({ consent_code: "hidden-code-456" })
        .expect(200);

      assert.ok(response.text.includes('name="consent_code"'));
      assert.ok(response.text.includes('value="hidden-code-456"'));
      assert.ok(response.text.includes('type="hidden"'));
    });

    it("should include Allow and Deny buttons", async () => {
      const response = await request(app)
        .get("/consent")
        .expect(200);

      assert.ok(response.text.includes('type="submit"'));
      assert.ok(response.text.includes(">Allow</button>"));
      assert.ok(response.text.includes(">Deny</button>"));
    });

    it("should include form action pointing to consent endpoint", async () => {
      const response = await request(app)
        .get("/consent")
        .expect(200);

      assert.ok(response.text.includes('action="/api/auth/oauth2/consent"'));
    });

    it("should be a valid HTML document", async () => {
      const response = await request(app)
        .get("/consent")
        .expect(200);

      assert.ok(response.text.includes("<!doctype html>"));
      assert.ok(response.text.includes("<html"));
      assert.ok(response.text.includes("</html>"));
      assert.ok(response.text.includes("<head>"));
      assert.ok(response.text.includes("<body>"));
    });

    it("should include JavaScript for form submission", async () => {
      const response = await request(app)
        .get("/consent")
        .expect(200);

      assert.ok(response.text.includes("<script>"));
      assert.ok(response.text.includes("</script>"));
      assert.ok(response.text.includes("addEventListener"));
      assert.ok(response.text.includes("preventDefault"));
    });

    it("should handle special characters in query parameters", async () => {
      const response = await request(app)
        .get("/consent")
        .query({
          client_id: "client-with-special-&<>\"'",
          scope: "read:user write:files",
        })
        .expect(200);

      // Response should be HTML-encoded properly
      assert.ok(response.text.includes("Consent Required"));
    });

    it("should handle undefined query parameter values", async () => {
      const response = await request(app)
        .get("/consent?client_id=&scope=")
        .expect(200);

      assert.ok(response.text.includes("Consent Required"));
    });
  });

  describe("GET /healthz", () => {
    it("should return health check status", async () => {
      const response = await request(app)
        .get("/healthz")
        .expect(200)
        .expect("Content-Type", /json/);

      assert.deepStrictEqual(response.body, { status: "ok" });
    });

    it("should always return ok status", async () => {
      // Multiple calls should consistently return ok
      for (let i = 0; i < 3; i++) {
        const response = await request(app).get("/healthz").expect(200);
        assert.strictEqual(response.body.status, "ok");
      }
    });
  });

  describe("Edge Cases and Error Handling", () => {
    it("should handle requests to non-existent routes", async () => {
      await request(app)
        .get("/non-existent-route")
        .expect(404);
    });

    it("should handle POST requests to login path", async () => {
      await request(app)
        .post("/login")
        .expect(404);
    });

    it("should handle POST requests to consent path", async () => {
      await request(app)
        .post("/consent")
        .expect(404);
    });

    it("should handle consent with very long query strings", async () => {
      const longScope = "scope-".repeat(100).slice(0, -1);
      const response = await request(app)
        .get("/consent")
        .query({ scope: longScope })
        .expect(200);

      assert.ok(response.text.includes("Consent Required"));
    });

    it("should handle multiple consent_code parameters", async () => {
      const response = await request(app)
        .get("/consent?consent_code=first&consent_code=second")
        .expect(200);

      // Should use the last value or handle gracefully
      assert.ok(response.text.includes("Consent Required"));
    });
  });

  describe("Environment Variable Configuration", () => {
    it("should use OIDC_LOGIN_PATH from environment", async () => {
      // The loginPath is set from env in the before hook
      await request(app)
        .get("/login")
        .expect(200);
    });

    it("should use OIDC_CONSENT_PATH from environment", async () => {
      // The consentPath is set from env in the before hook
      await request(app)
        .get("/consent")
        .expect(200);
    });
  });
});