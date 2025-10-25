import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import {
  buildMcpTestHarness,
  createMcpSession,
  createRegistryClient,
} from "./helpers/mcp-fixtures.mjs";

const STORY_KEY = "1-2";
const PRIORITY = {
  P0: "[P0]",
  P1: "[P1]",
};
const TEST_IDS = {
  token: "1.2-API-001",
  scopeMismatch: "1.2-API-002",
  tokenSanitized: "1.2-API-007",
  introspection: "1.2-API-003",
  introspectionInactive: "1.2-API-008",
  session: "1.2-API-004",
  handshake: "1.2-API-005",
  handshakeOrigin: "1.2-API-006",
};

describe(`[Story ${STORY_KEY}] MCP compliance responses`, () => {
  let app;
  let registryClient;
  let sessionStore;
  let restoreEnv;

  before(async () => {
    registryClient = createRegistryClient({
      id: "todo-client",
      origin: "https://todo.example.com",
      resource: "https://todo.example.com/api",
      redirectUri: "https://todo.example.com/oauth/callback",
      scopes: ["tasks.read"],
    });

    const harness = await buildMcpTestHarness({
      registryClient,
      sessions: [
        createMcpSession({
          token: "opaque-token",
          userId: "user-123",
          registryClient,
        }),
        createMcpSession({
          token: "session-token",
          userId: "user-456",
          registryClient,
        }),
      ],
    });

    ({ app, sessionStore, restoreEnv } = harness);
  });

  after(() => {
    if (sessionStore) {
      sessionStore.clear();
    }
    if (restoreEnv) {
      restoreEnv();
      restoreEnv = undefined;
    }
  });

  it(`${PRIORITY.P0}[${TEST_IDS.token}] normalizes token responses to MCP schema`, async () => {
    // Given an MCP registry client registered with the tasks.read scope
    // When the OAuth2 token endpoint is invoked with matching client credentials
    // Then the response includes the MCP-required metadata fields
    const response = await request(app)
      .post("/api/auth/oauth2/token")
      .set("Content-Type", "application/x-www-form-urlencoded")
      .send(
        new URLSearchParams({
          grant_type: "client_credentials",
          client_id: "todo-client",
          scope: "tasks.read",
        }).toString(),
      )
      .expect(200)
      .expect("Content-Type", /json/);

    assert.equal(response.body.client_id, "todo-client");
    assert.equal(response.body.resource, "https://todo.example.com/api");
    assert.equal(response.body.scope, "tasks.read");
    assert.equal(response.body.token_type, "Bearer");
    assert.equal(typeof response.body.expires_in, "number");
  });

  it(`${PRIORITY.P0}[${TEST_IDS.scopeMismatch}] rejects scope mismatches when enforcement enabled`, async () => {
    // Given MCP scope enforcement is enabled for the registered client
    // When the client requests a token with an unauthorized scope
    // Then the service returns a scope_mismatch error and logs a structured warning
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => {
      warnings.push(args);
    };

    try {
      const response = await request(app)
        .post("/api/auth/oauth2/token")
        .set("Content-Type", "application/x-www-form-urlencoded")
        .send(
          new URLSearchParams({
            grant_type: "client_credentials",
            client_id: "todo-client",
            scope: "tasks.write",
          }).toString(),
        )
        .expect(403)
        .expect("Content-Type", /json/);

      assert.equal(response.body.error, "scope_mismatch");
      assert.equal(response.body.clientId, "todo-client");
      assert.ok(
        warnings.some(([message]) =>
          typeof message === "string" && message.includes("mcp_scope_mismatch"),
        ),
        "expected structured scope mismatch log",
      );
    } finally {
      console.warn = originalWarn;
    }
  });

  it(`${PRIORITY.P0}[${TEST_IDS.tokenSanitized}] sanitizes forwarded scopes when enforcement is relaxed`, async () => {
    const relaxedHarness = await buildMcpTestHarness({
      registryClient,
      sessions: [],
      environment: {
        MCP_ENFORCE_SCOPE_ALIGNMENT: "false",
      },
    });

    const { app: relaxedApp, sessionStore: relaxedStore, restoreEnv: restoreRelaxedEnv } =
      relaxedHarness;

    try {
      const response = await request(relaxedApp)
        .post("/api/auth/oauth2/token")
        .set("Content-Type", "application/x-www-form-urlencoded")
        .send(
          new URLSearchParams({
            grant_type: "client_credentials",
            client_id: registryClient.id,
            scope: "tasks.read tasks.write",
          }).toString(),
        )
        .expect(200)
        .expect("Content-Type", /json/);

      assert.equal(response.body.scope, "tasks.read");

      const forwarded = relaxedStore.get("last-token-body");
      assert.equal(typeof forwarded, "string", "expected OAuth proxy to capture request body");
      const forwardedParams = new URLSearchParams(forwarded ?? "");
      assert.equal(forwardedParams.get("scope"), "tasks.read");
    } finally {
      relaxedStore.clear();
      restoreRelaxedEnv?.();
    }
  });

  it(`${PRIORITY.P0}[${TEST_IDS.introspection}] enriches introspection responses with MCP metadata`, async () => {
    // Given an active opaque token associated with the registry client
    // When the introspection endpoint validates that token
    // Then the response surfaces MCP metadata including client, resource, and issued token type
    const response = await request(app)
      .post("/api/auth/oauth2/introspect")
      .set("Content-Type", "application/x-www-form-urlencoded")
      .send(new URLSearchParams({ token: "opaque-token" }).toString())
      .expect(200)
      .expect("Content-Type", /json/);

    assert.equal(response.body.active, true);
    assert.equal(response.body.client_id, "todo-client");
    assert.equal(response.body.resource, "https://todo.example.com/api");
    assert.equal(response.body.scope, "tasks.read");
    assert.equal(
      response.body.issued_token_type,
      "urn:ietf:params:oauth:token-type:access_token",
    );
  });

  it(`${PRIORITY.P0}[${TEST_IDS.introspectionInactive}] returns inactive response for unknown tokens`, async () => {
    const response = await request(app)
      .post("/api/auth/oauth2/introspect")
      .set("Content-Type", "application/x-www-form-urlencoded")
      .send(new URLSearchParams({ token: "invalid-token" }).toString())
      .expect(200)
      .expect("Content-Type", /json/);

    assert.deepEqual(response.body, { active: false });
  });

  it(`${PRIORITY.P0}[${TEST_IDS.session}] returns MCP session payload with issued and expiry timestamps`, async () => {
    // Given a persisted MCP session for the registry client
    // When the session helper is queried with the session token
    // Then the helper responds with user identity, scopes, and temporal metadata
    const response = await request(app)
      .get("/api/auth/mcp/session")
      .set("Authorization", "Bearer session-token")
      .expect(200)
      .expect("Content-Type", /json/);

    assert.equal(response.body.userId, "user-456");
    assert.equal(response.body.clientId, "todo-client");
    assert.equal(response.body.resource, "https://todo.example.com/api");
    assert.ok(Array.isArray(response.body.scopes));
    assert.match(response.body.issuedAt ?? "", /\d{4}-\d{2}-\d{2}T/);
    assert.match(response.body.expiresAt ?? "", /\d{4}-\d{2}-\d{2}T/);
  });

  it(`${PRIORITY.P0}[${TEST_IDS.handshake}] exposes consent and discovery URLs via handshake`, async () => {
    // Given a trusted origin registered for the MCP client
    // When the handshake endpoint is invoked with the client identifier
    // Then the response includes consent, discovery, and session endpoints derived from Better Auth
    const response = await request(app)
      .get("/api/auth/mcp/handshake")
      .set("Origin", "https://todo.example.com")
      .query({ client_id: "todo-client" })
      .expect(200)
      .expect("Content-Type", /json/);

    assert.equal(response.body.clientId, "todo-client");
    assert.equal(response.body.endpoints.consent, response.body.metadata.consent_endpoint);
    assert.equal(response.body.endpoints.discovery, response.body.metadata.discovery_endpoint);
    assert.equal(
      response.body.endpoints.session,
      `${process.env.BETTER_AUTH_URL}/api/auth/mcp/session`,
    );
  });

  it(`${PRIORITY.P1}[${TEST_IDS.handshakeOrigin}] logs origin mismatches during handshake`, async () => {
    // Given a request from an untrusted origin
    // When the handshake endpoint is executed with a registered client identifier
    // Then the service denies the request and emits a structured origin mismatch warning
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => {
      warnings.push(args);
    };

    try {
      await request(app)
        .get("/api/auth/mcp/handshake")
        .set("Origin", "https://auth.example.com")
        .query({ client_id: "todo-client" })
        .expect(403)
        .expect("Content-Type", /json/);

      assert.ok(
        warnings.some(([message]) =>
          typeof message === "string" && message.includes("mcp_handshake_origin_mismatch"),
        ),
        "expected structured origin mismatch log",
      );
    } finally {
      console.warn = originalWarn;
    }
  });
});
