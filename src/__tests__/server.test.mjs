import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

process.env.BETTER_AUTH_DB_DRIVER = process.env.BETTER_AUTH_DB_DRIVER ?? "node";

let createApp;
const originalEnv = {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
};

const importApp = async () => {
  if (!createApp) {
    ({ createApp } = await import("../../dist/server.js"));
  }
  return createApp;
};

describe("server", () => {
  let app;
  let authMock;

  before(async () => {
    process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "test-client";
    process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "test-secret";
    const createAppFn = await importApp();

    authMock = {
      handler: async () => new Response(null, { status: 404 }),
      api: {
        getMcpOAuthConfig: mock.fn(async () => ({
          issuer: "http://localhost:3000",
          jwks_uri: "http://localhost:3000/.well-known/jwks.json",
          registration_endpoint: "http://localhost:3000/api/auth/oauth2/register",
          authorization_endpoint: "http://localhost:3000/api/auth/oauth2/authorize",
          token_endpoint: "http://localhost:3000/api/auth/oauth2/token",
        })),
        getMCPProtectedResource: mock.fn(async () => ({
          resource: "http://localhost:3000",
          authorization_servers: ["http://localhost:3000"],
          jwks_uri: "http://localhost:3000/.well-known/jwks.json",
          scopes_supported: ["mcp"],
        })),
      },
    };

    app = createAppFn({ authInstance: authMock, loginPath: "/login", consentPath: "/consent" });
  });

  beforeEach(() => {
    authMock.api.getMcpOAuthConfig.mock.resetCalls();
    authMock.api.getMCPProtectedResource.mock.resetCalls();
  });

  after(() => {
    process.env.GOOGLE_CLIENT_ID = originalEnv.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = originalEnv.GOOGLE_CLIENT_SECRET;
  });

  afterEach(() => {
    mock.reset();
  });

  describe("CORS", () => {
    it("allows requests from trusted origins", async () => {
      const origin = "https://auth.onemainarmy.com";

      const response = await request(app)
        .get("/healthz")
        .set("Origin", origin)
        .expect(200);

      assert.equal(response.headers["access-control-allow-origin"], origin);
      assert.equal(response.headers["access-control-allow-credentials"], "true");
    });

    it("rejects requests from unknown origins", async () => {
      const response = await request(app)
        .get("/healthz")
        .set("Origin", "https://example.invalid")
        .expect(403)
        .expect("Content-Type", /json/);

      assert.deepEqual(response.body, { error: "origin_not_allowed" });
    });

    it("rejects API requests without an Origin header", async () => {
      const response = await request(app)
        .get("/api/auth/session")
        .expect(403)
        .expect("Content-Type", /json/);

      assert.deepEqual(response.body, { error: "origin_not_allowed" });
    });
  });

  describe("/.well-known/oauth-authorization-server", () => {
    it("returns discovery metadata", async () => {
      const response = await request(app)
        .get("/.well-known/oauth-authorization-server")
        .set("Origin", "https://auth.onemainarmy.com")
        .expect(200)
        .expect("Content-Type", /json/);

      assert.deepEqual(response.body, {
        issuer: "http://localhost:3000",
        jwks_uri: "http://localhost:3000/.well-known/jwks.json",
        registration_endpoint: "http://localhost:3000/api/auth/oauth2/register",
        authorization_endpoint: "http://localhost:3000/api/auth/oauth2/authorize",
        token_endpoint: "http://localhost:3000/api/auth/oauth2/token",
      });
      assert.strictEqual(authMock.api.getMcpOAuthConfig.mock.calls.length, 1);
    });
  });

  describe("/.well-known/oauth-protected-resource", () => {
    it("returns protected resource metadata", async () => {
      const response = await request(app)
        .get("/.well-known/oauth-protected-resource")
        .set("Origin", "https://auth.onemainarmy.com")
        .expect(200)
        .expect("Content-Type", /json/);

      assert.deepEqual(response.body, {
        resource: "http://localhost:3000",
        authorization_servers: ["http://localhost:3000"],
        jwks_uri: "http://localhost:3000/.well-known/jwks.json",
        scopes_supported: ["mcp"],
      });
      assert.strictEqual(authMock.api.getMCPProtectedResource.mock.calls.length, 1);
    });
  });

  describe("/login", () => {
    it("renders the enhanced login page", async () => {
      const response = await request(app)
        .get("/login")
        .set("Origin", "https://auth.onemainarmy.com")
        .expect(200)
        .expect("Content-Type", /html/);

      assert.ok(response.text.includes("Welcome to Better Auth"));
      assert.ok(response.text.includes("Continue with Google"));
      assert.ok(response.text.includes("/api/auth/sign-in/social?provider=google"));
    });
  });

  describe("/consent", () => {
    it("renders consent details with scope list", async () => {
      const response = await request(app)
        .get("/consent")
        .query({
          consent_code: "code-123",
          client_id: "todo-client",
          scope: "read write",
        })
        .set("Origin", "https://auth.onemainarmy.com")
        .expect(200)
        .expect("Content-Type", /html/);

      const html = response.text;
      assert.ok(html.includes("Allow access"));
      assert.ok(html.includes("todo-client"));
      assert.ok(html.includes("<li><code>read</code></li>"));
      assert.ok(html.includes("<li><code>write</code></li>"));
      assert.ok(html.includes("/api/auth/oauth2/consent"));
    });
  });
});
