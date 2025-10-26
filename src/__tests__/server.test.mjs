import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

process.env.BETTER_AUTH_DB_DRIVER = process.env.BETTER_AUTH_DB_DRIVER ?? "node";

let createApp;
const originalEnv = {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  MCP_RESOURCE: process.env.MCP_RESOURCE,
  MCP_CLIENTS: process.env.MCP_CLIENTS,
  MCP_DEFAULT_SCOPES: process.env.MCP_DEFAULT_SCOPES,
  MCP_ENFORCE_SCOPE_ALIGNMENT: process.env.MCP_ENFORCE_SCOPE_ALIGNMENT,
};

const importApp = async () => {
  if (!createApp) {
    ({ createApp } = await import("../../dist/server.js"));
  }
  return createApp;
};

const OpenIdSchema = Type.Intersect([
  Type.Object({
    issuer: Type.String(),
    authorization_endpoint: Type.String(),
    token_endpoint: Type.String(),
    introspection_endpoint: Type.String(),
    revocation_endpoint: Type.Optional(Type.String()),
    consent_endpoint: Type.String(),
    discovery_endpoint: Type.String(),
  }),
  Type.Object({
    mcp_session_endpoint: Type.String(),
    mcp_handshake_endpoint: Type.String(),
    mcp_servers_metadata: Type.String(),
    mcp_scopes_supported: Type.Array(Type.String()),
  }),
]);

const ServersSchema = Type.Object({
  generatedAt: Type.String(),
  servers: Type.Array(
    Type.Object({
      id: Type.String(),
      origin: Type.String(),
      resource: Type.String(),
      scopes: Type.Array(Type.String()),
      handshakeEndpoint: Type.String(),
      sessionEndpoint: Type.String(),
    }),
  ),
});

describe("server", () => {
  let app;
  let authMock;

  before(async () => {
    process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "test-client";
    process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "test-secret";
    process.env.BETTER_AUTH_URL = "https://auth.onemainarmy.com";
    process.env.MCP_RESOURCE = "https://todo.onemainarmy.com";
    process.env.MCP_DEFAULT_SCOPES = "openid profile";
    process.env.MCP_CLIENTS = JSON.stringify([
      {
        id: "todo-client",
        origin: "https://todo.onemainarmy.com",
        scopes: ["tasks.read"],
        resource: "https://todo.onemainarmy.com",
        redirectUri: "https://todo.onemainarmy.com/oauth/callback",
      },
    ]);
    process.env.MCP_ENFORCE_SCOPE_ALIGNMENT = "true";
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
          consent_endpoint: "http://localhost:3000/consent",
          discovery_endpoint: "http://localhost:3000/.well-known/openid-configuration",
        })),
        getMCPProtectedResource: mock.fn(async () => ({
          resource: "http://localhost:3000",
          authorization_servers: ["http://localhost:3000"],
          jwks_uri: "http://localhost:3000/.well-known/jwks.json",
          scopes_supported: ["mcp"],
        })),
        getMcpSession: mock.fn(async () => null),
      },
    };

    app = createAppFn({ authInstance: authMock, loginPath: "/login", consentPath: "/consent" });
  });

  beforeEach(() => {
    authMock.api.getMcpOAuthConfig.mock.resetCalls();
    authMock.api.getMCPProtectedResource.mock.resetCalls();
    authMock.api.getMcpSession.mock.resetCalls();
  });

  after(() => {
    process.env.GOOGLE_CLIENT_ID = originalEnv.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = originalEnv.GOOGLE_CLIENT_SECRET;
    process.env.BETTER_AUTH_URL = originalEnv.BETTER_AUTH_URL;
    process.env.MCP_RESOURCE = originalEnv.MCP_RESOURCE;
    process.env.MCP_CLIENTS = originalEnv.MCP_CLIENTS;
    process.env.MCP_DEFAULT_SCOPES = originalEnv.MCP_DEFAULT_SCOPES;
    process.env.MCP_ENFORCE_SCOPE_ALIGNMENT = originalEnv.MCP_ENFORCE_SCOPE_ALIGNMENT;
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

    it("allows API requests without an Origin header", async () => {
      await request(app).get("/api/auth/session").expect(404);
    });

    it("rejects API requests from disallowed origins", async () => {
      const response = await request(app)
        .get("/api/auth/session")
        .set("Origin", "https://example.invalid")
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

      assert.equal(Value.Check(OpenIdSchema, response.body), true);
      const metadataBase = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
      const expectedSessionEndpoint = new URL("/api/auth/mcp/session", metadataBase).toString();
      const expectedHandshakeEndpoint = new URL(
        "/api/auth/mcp/handshake",
        metadataBase,
      ).toString();
      const expectedIntrospectionEndpoint = new URL(
        "/api/auth/oauth2/introspect",
        metadataBase,
      ).toString();
      const expectedServersMetadata = new URL(
        "/.well-known/mcp-servers.json",
        metadataBase,
      ).toString();
      assert.equal(response.body.revocation_endpoint, undefined);
      const { revocation_endpoint: _ignoredRevocation, ...rest } = response.body;
      assert.deepEqual(rest, {
        issuer: "http://localhost:3000",
        jwks_uri: "http://localhost:3000/.well-known/jwks.json",
        registration_endpoint: "http://localhost:3000/api/auth/oauth2/register",
        authorization_endpoint: "http://localhost:3000/api/auth/oauth2/authorize",
        token_endpoint: "http://localhost:3000/api/auth/oauth2/token",
        introspection_endpoint: expectedIntrospectionEndpoint,
        consent_endpoint: "http://localhost:3000/consent",
        discovery_endpoint: "http://localhost:3000/.well-known/openid-configuration",
        mcp_session_endpoint: expectedSessionEndpoint,
        mcp_handshake_endpoint: expectedHandshakeEndpoint,
        mcp_scopes_supported: ["openid", "profile", "tasks.read"],
        mcp_servers_metadata: expectedServersMetadata,
      });
      assert.strictEqual(authMock.api.getMcpOAuthConfig.mock.calls.length, 1);
    });
  });

  describe("/.well-known/mcp-servers.json", () => {
    it("lists registered MCP servers with handshake+session endpoints", async () => {
      const response = await request(app)
        .get("/.well-known/mcp-servers.json")
        .expect(200)
        .expect("Content-Type", /json/);

      assert.equal(Value.Check(ServersSchema, response.body), true);
      const metadataBase = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
      assert.equal(response.body.generatedAt.includes("T"), true);
      assert.deepEqual(response.body.servers, [
        {
          id: "todo-client",
          origin: "https://todo.onemainarmy.com",
          resource: "https://todo.onemainarmy.com",
          scopes: ["tasks.read"],
          handshakeEndpoint: `${metadataBase}/api/auth/mcp/handshake?client_id=todo-client`,
          sessionEndpoint: new URL("/api/auth/mcp/session", metadataBase).toString(),
        },
      ]);
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
    it("allows requests without an Origin header", async () => {
      const response = await request(app)
        .get("/login")
        .expect(200)
        .expect("Content-Type", /html/);

      assert.ok(response.text.includes("Welcome to Better Auth"));
    });

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

  describe("/api/auth/mcp/handshake", () => {
    it("returns enriched metadata for registered clients", async () => {
      const response = await request(app)
        .get("/api/auth/mcp/handshake")
        .query({ client_id: "todo-client" })
        .set("Origin", "https://todo.onemainarmy.com")
        .expect(200)
        .expect("Content-Type", /json/);

      assert.equal(authMock.api.getMcpOAuthConfig.mock.calls.length, 1);
      assert.deepEqual(response.body.clientId, "todo-client");
      assert.deepEqual(response.body.resource, "https://todo.onemainarmy.com");
      assert.deepEqual(response.body.scopes, ["tasks.read"]);
      assert.ok(response.body.metadata);
      const metadataBase = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
      assert.strictEqual(
        response.body.endpoints.session,
        new URL("/api/auth/mcp/session", metadataBase).toString(),
      );
      assert.strictEqual(
        response.body.endpoints.consent,
        response.body.metadata.consent_endpoint,
      );
      assert.strictEqual(
        response.body.endpoints.discovery,
        response.body.metadata.discovery_endpoint,
      );
    });

    it("rejects unregistered clients", async () => {
      await request(app)
        .get("/api/auth/mcp/handshake")
        .query({ client_id: "unknown" })
        .expect(404)
        .expect("Content-Type", /json/);
    });

    it("rejects malformed origin values", async () => {
      const response = await request(app)
        .get("/api/auth/mcp/handshake")
        .query({ client_id: "todo-client", origin: "not-a-valid-origin" })
        .expect(400)
        .expect("Content-Type", /json/);

      assert.equal(response.body.error, "invalid_origin");
      assert.equal(response.body.value, "not-a-valid-origin");
    });

    it("rejects clients when origin header does not match registry entry", async () => {
      const response = await request(app)
        .get("/api/auth/mcp/handshake")
        .query({ client_id: "todo-client" })
        .set("Origin", "https://auth.onemainarmy.com")
        .expect(403)
        .expect("Content-Type", /json/);

      assert.equal(response.body.error, "origin_mismatch");
      assert.equal(response.body.expected, "https://todo.onemainarmy.com");
      assert.equal(response.body.received, "https://auth.onemainarmy.com");
    });
  });

  describe("/api/auth/mcp/session", () => {
    it("demands a bearer token", async () => {
      const response = await request(app)
        .get("/api/auth/mcp/session")
        .expect(401)
        .expect("Content-Type", /json/);

      assert.equal(response.body.error, "missing_authorization");
      assert.match(response.headers["www-authenticate"], /Bearer/);
    });
  });
});
