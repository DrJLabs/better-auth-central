import { before, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

let createApp;

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

  describe("/.well-known/oauth-authorization-server", () => {
    it("returns discovery metadata", async () => {
      const response = await request(app)
        .get("/.well-known/oauth-authorization-server")
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
    it("renders the configured path", async () => {
      const response = await request(app)
        .get("/login")
        .expect(200)
        .expect("Content-Type", /html/);

      assert.ok(response.text.includes("Customize Your Login Experience"));
      assert.ok(response.text.includes("/login"));
    });

    it("escapes a custom login path", async () => {
      const createAppFn = await importApp();
      const customApp = createAppFn({
        authInstance: authMock,
        loginPath: '/login?next=<script>alert(1)</script>',
      });

      const response = await request(customApp)
        .get('/login?next=<script>alert(1)</script>')
        .expect(200);

      assert.ok(response.text.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
      assert.ok(!response.text.includes("<script>alert(1)</script>"));
    });
  });

  describe("/consent", () => {
    it("escapes client supplied values", async () => {
      const response = await request(app)
        .get("/consent")
        .query({
          consent_code: "code-&-<>",
          client_id: "client-&-<>\"'",
          scope: "read\nwrite",
        })
        .expect(200)
        .expect("Content-Type", /html/);

      const html = response.text;
      assert.ok(html.includes("code-&amp;-&lt;&gt;"));
      assert.ok(html.includes("client-&amp;-&lt;&gt;&quot;&#39;"));
      assert.ok(html.includes("read\nwrite".replace(/\n/g, "\n")));
      assert.ok(!html.includes("client-&-<>\"'"));
      assert.ok(!html.includes("code-&-<>"));
      assert.ok(!html.includes("<script>"));
    });
  });
});
