import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import path from "node:path";

const scriptPath = path.resolve(
  fileURLToPath(new URL("../mcp-compliance.mjs", import.meta.url)),
);

const startServer = (handlers) =>
  new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? "", `http://${req.headers.host}`);
        const handler = handlers[url.pathname];
        if (!handler) {
          res.writeHead(404).end();
          return;
        }

        const chunks = [];
        for await (const chunk of req) {
          chunks.push(Buffer.from(chunk));
        }
        const body = Buffer.concat(chunks).toString("utf-8");

        await handler({ req, res, url, body });
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" }).end(
          JSON.stringify({ error: (error instanceof Error ? error.message : String(error)) ?? "internal_error" }),
        );
      }
    });
    server.listen(0, () => {
      const address = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
    });
  });

const runCli = (baseUrl, extraArgs = []) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, `--base-url=${baseUrl}`, ...extraArgs], {
      stdio: ["inherit", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });

const buildDocuments = ({
  handshakeClientId = "todo-client",
  handshakeOrigin = "https://todo.example.com",
} = {}) => {
  const serversDocument = {
    generatedAt: new Date().toISOString(),
    servers: [
      {
        id: "todo-client",
        origin: handshakeOrigin,
        resource: "https://todo.example.com",
        scopes: ["tasks.read"],
        handshakeEndpoint: "HANDSHAKE_PLACEHOLDER",
        sessionEndpoint: "SESSION_PLACEHOLDER",
      },
    ],
  };

  const openIdDocument = {
    issuer: "https://auth.example.com",
    authorization_endpoint: "https://auth.example.com/oauth2/authorize",
    token_endpoint: "https://auth.example.com/oauth2/token",
    introspection_endpoint: "https://auth.example.com/oauth2/introspect",
    mcp_session_endpoint: "https://auth.example.com/api/auth/mcp/session",
    mcp_handshake_endpoint: "https://auth.example.com/api/auth/mcp/handshake",
    mcp_servers_metadata: "https://auth.example.com/.well-known/mcp-servers.json",
    mcp_scopes_supported: ["openid", "tasks.read"],
  };

  return { serversDocument, openIdDocument, handshakeClientId };
};

afterEach(() => {
  delete process.env.MCP_CLIENTS;
});

describe("scripts/mcp-compliance", () => {
  it("exits successfully when all compliance checks pass", async () => {
    const { serversDocument, openIdDocument, handshakeClientId } = buildDocuments();

    const metrics = {
      tokenCalls: 0,
      introspectionCalls: 0,
      sessionChallenges: 0,
      sessionAuthorized: 0,
    };

    const { server, baseUrl } = await startServer({
      "/.well-known/mcp-servers.json": ({ res }) => {
        const body = {
          ...serversDocument,
          servers: serversDocument.servers.map((serverEntry) => ({
            ...serverEntry,
            handshakeEndpoint: new URL("/api/auth/mcp/handshake", baseUrl).toString(),
            sessionEndpoint: new URL("/api/auth/mcp/session", baseUrl).toString(),
          })),
        };
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(body));
      },
      "/.well-known/oauth-authorization-server": ({ res }) => {
        res.writeHead(200, { "Content-Type": "application/json" }).end(
          JSON.stringify({
            issuer: new URL("/", baseUrl).toString().replace(/\/$/, ""),
            authorization_endpoint: new URL("/oauth2/authorize", baseUrl).toString(),
            token_endpoint: new URL("/oauth2/token", baseUrl).toString(),
            introspection_endpoint: new URL("/oauth2/introspect", baseUrl).toString(),
            grant_types_supported: ["client_credentials"],
            mcp_session_endpoint: new URL("/api/auth/mcp/session", baseUrl).toString(),
            mcp_handshake_endpoint: new URL("/api/auth/mcp/handshake", baseUrl).toString(),
            mcp_servers_metadata: new URL("/.well-known/mcp-servers.json", baseUrl).toString(),
            mcp_scopes_supported: ["openid", "tasks.read"],
          }),
        );
      },
      "/api/auth/mcp/handshake": ({ req, res, url }) => {
        const originHeader = req.headers.origin;
        const origin = originHeader ?? url.searchParams.get("origin") ?? serversDocument.servers[0].origin;
        if (!origin) {
          res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "missing_origin" }));
          return;
        }
        res
          .writeHead(200, { "Content-Type": "application/json" })
          .end(
            JSON.stringify({
              clientId: handshakeClientId,
              resource: "https://todo.example.com",
              scopes: ["tasks.read"],
              metadata: {
                authorization_endpoint: new URL("/oauth2/authorize", baseUrl).toString(),
                token_endpoint: new URL("/oauth2/token", baseUrl).toString(),
                introspection_endpoint: new URL("/oauth2/introspect", baseUrl).toString(),
                revocation_endpoint: new URL("/oauth2/revoke", baseUrl).toString(),
                consent_endpoint: new URL("/consent", baseUrl).toString(),
                discovery_endpoint: new URL("/.well-known/oauth-authorization-server", baseUrl).toString(),
                jwks_uri: new URL("/.well-known/jwks.json", baseUrl).toString(),
              },
              endpoints: {
                authorization: new URL("/oauth2/authorize", baseUrl).toString(),
                token: new URL("/oauth2/token", baseUrl).toString(),
                introspection: new URL("/oauth2/introspect", baseUrl).toString(),
                revocation: new URL("/oauth2/revoke", baseUrl).toString(),
                consent: new URL("/consent", baseUrl).toString(),
                discovery: new URL("/.well-known/openid-configuration", baseUrl).toString(),
                session: new URL("/api/auth/mcp/session", baseUrl).toString(),
                serversMetadata: new URL("/.well-known/mcp-servers.json", baseUrl).toString(),
              },
            }),
          );
      },
      "/oauth2/token": ({ res, body }) => {
        metrics.tokenCalls += 1;
        const form = new URLSearchParams(body);
        if (form.get("client_id") !== handshakeClientId) {
          res
            .writeHead(400, { "Content-Type": "application/json" })
            .end(JSON.stringify({ error: "client_mismatch" }));
          return;
        }
        res
          .writeHead(200, { "Content-Type": "application/json" })
          .end(
            JSON.stringify({
              access_token: "opaque-token",
              token_type: "Bearer",
              scope: "tasks.read",
              expires_in: 300,
              client_id: handshakeClientId,
              resource: serversDocument.servers[0].resource,
            }),
          );
      },
      "/oauth2/introspect": ({ res, body }) => {
        metrics.introspectionCalls += 1;
        const form = new URLSearchParams(body);
        if (form.get("token") !== "opaque-token") {
          res
            .writeHead(400, { "Content-Type": "application/json" })
            .end(JSON.stringify({ error: "unknown_token" }));
          return;
        }
        res
          .writeHead(200, { "Content-Type": "application/json" })
          .end(
            JSON.stringify({
              active: true,
              client_id: handshakeClientId,
              resource: serversDocument.servers[0].resource,
              issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
              scope: "tasks.read",
            }),
          );
      },
      "/api/auth/mcp/session": ({ req, res }) => {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
          metrics.sessionChallenges += 1;
          res
            .writeHead(401, {
              "Content-Type": "application/json",
              "WWW-Authenticate": 'Bearer realm="Better Auth"',
            })
            .end(JSON.stringify({ error: "missing_authorization" }));
          return;
        }

        metrics.sessionAuthorized += 1;
        res
          .writeHead(200, { "Content-Type": "application/json" })
          .end(
            JSON.stringify({
              userId: "operator-1",
              clientId: handshakeClientId,
              scopes: ["tasks.read"],
              issuedAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 300_000).toISOString(),
              resource: serversDocument.servers[0].resource,
            }),
          );
      },
    });

    try {
      const result = await runCli(baseUrl);

      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /MCP compliance checks passed/);
      assert.ok(metrics.tokenCalls > 0, "Token endpoint should be exercised");
      assert.ok(metrics.introspectionCalls > 0, "Introspection endpoint should be exercised");
      assert.ok(metrics.sessionChallenges > 0, "Session challenge should be validated");
      assert.ok(metrics.sessionAuthorized > 0, "Session endpoint should be called with bearer token");
    } finally {
      server.close();
    }
  });

  it("skips token flow when client_credentials grant is not advertised but still verifies session challenge", async () => {
    const { serversDocument, handshakeClientId } = buildDocuments();

    const metrics = {
      tokenCalls: 0,
      introspectionCalls: 0,
      sessionChallenges: 0,
    };

    const { server, baseUrl } = await startServer({
      "/.well-known/mcp-servers.json": ({ res }) => {
        const body = {
          ...serversDocument,
          servers: serversDocument.servers.map((serverEntry) => ({
            ...serverEntry,
            handshakeEndpoint: new URL("/api/auth/mcp/handshake", baseUrl).toString(),
            sessionEndpoint: new URL("/api/auth/mcp/session", baseUrl).toString(),
          })),
        };
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(body));
      },
      "/.well-known/oauth-authorization-server": ({ res }) => {
        res.writeHead(200, { "Content-Type": "application/json" }).end(
          JSON.stringify({
            issuer: new URL("/", baseUrl).toString().replace(/\/$/, ""),
            authorization_endpoint: new URL("/oauth2/authorize", baseUrl).toString(),
            token_endpoint: new URL("/oauth2/token", baseUrl).toString(),
            introspection_endpoint: new URL("/oauth2/introspect", baseUrl).toString(),
            mcp_session_endpoint: new URL("/api/auth/mcp/session", baseUrl).toString(),
            mcp_handshake_endpoint: new URL("/api/auth/mcp/handshake", baseUrl).toString(),
            mcp_servers_metadata: new URL("/.well-known/mcp-servers.json", baseUrl).toString(),
            mcp_scopes_supported: ["openid", "tasks.read"],
          }),
        );
      },
      "/api/auth/mcp/handshake": ({ req, res, url }) => {
        const originHeader = req.headers.origin;
        const origin = originHeader ?? url.searchParams.get("origin") ?? serversDocument.servers[0].origin;
        if (!origin) {
          res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "missing_origin" }));
          return;
        }
        res
          .writeHead(200, { "Content-Type": "application/json" })
          .end(
            JSON.stringify({
              clientId: handshakeClientId,
              resource: "https://todo.example.com",
              scopes: ["tasks.read"],
              metadata: {
                authorization_endpoint: new URL("/oauth2/authorize", baseUrl).toString(),
                token_endpoint: new URL("/oauth2/token", baseUrl).toString(),
                introspection_endpoint: new URL("/oauth2/introspect", baseUrl).toString(),
                revocation_endpoint: new URL("/oauth2/revoke", baseUrl).toString(),
                consent_endpoint: new URL("/consent", baseUrl).toString(),
                discovery_endpoint: new URL("/.well-known/oauth-authorization-server", baseUrl).toString(),
                jwks_uri: new URL("/.well-known/jwks.json", baseUrl).toString(),
              },
              endpoints: {
                authorization: new URL("/oauth2/authorize", baseUrl).toString(),
                token: new URL("/oauth2/token", baseUrl).toString(),
                introspection: new URL("/oauth2/introspect", baseUrl).toString(),
                revocation: new URL("/oauth2/revoke", baseUrl).toString(),
                consent: new URL("/consent", baseUrl).toString(),
                discovery: new URL("/.well-known/openid-configuration", baseUrl).toString(),
                session: new URL("/api/auth/mcp/session", baseUrl).toString(),
                serversMetadata: new URL("/.well-known/mcp-servers.json", baseUrl).toString(),
              },
            }),
          );
      },
      "/oauth2/token": ({ res }) => {
        metrics.tokenCalls += 1;
        res
          .writeHead(500, { "Content-Type": "application/json" })
          .end(JSON.stringify({ error: "token endpoint should be skipped" }));
      },
      "/oauth2/introspect": ({ res }) => {
        metrics.introspectionCalls += 1;
        res
          .writeHead(500, { "Content-Type": "application/json" })
          .end(JSON.stringify({ error: "introspection endpoint should be skipped" }));
      },
      "/api/auth/mcp/session": ({ req, res }) => {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
          metrics.sessionChallenges += 1;
          res
            .writeHead(401, {
              "Content-Type": "application/json",
              "WWW-Authenticate": 'Bearer realm="Better Auth"',
            })
            .end(JSON.stringify({ error: "missing_authorization" }));
          return;
        }

        res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "unexpected" }));
      },
    });

    try {
      const result = await runCli(baseUrl);

      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /Skipping client_credentials flow/);
      assert.equal(metrics.tokenCalls, 0);
      assert.equal(metrics.introspectionCalls, 0);
      assert.ok(metrics.sessionChallenges > 0, "Session challenge should be validated even when grant is absent");
    } finally {
      server.close();
    }
  });

  it("fails when the handshake payload does not match the registry entry", async () => {
    const { serversDocument, openIdDocument } = buildDocuments({ handshakeClientId: "wrong-client" });

    const { server, baseUrl } = await startServer({
      "/.well-known/mcp-servers.json": ({ res }) => {
        const body = {
          ...serversDocument,
          servers: serversDocument.servers.map((serverEntry) => ({
            ...serverEntry,
            handshakeEndpoint: new URL("/api/auth/mcp/handshake", baseUrl).toString(),
            sessionEndpoint: new URL("/api/auth/mcp/session", baseUrl).toString(),
          })),
        };
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(body));
      },
      "/.well-known/oauth-authorization-server": ({ res }) => {
        res.writeHead(200, { "Content-Type": "application/json" }).end(
          JSON.stringify({
            issuer: new URL("/", baseUrl).toString().replace(/\/$/, ""),
            authorization_endpoint: new URL("/oauth2/authorize", baseUrl).toString(),
            token_endpoint: new URL("/oauth2/token", baseUrl).toString(),
            introspection_endpoint: new URL("/oauth2/introspect", baseUrl).toString(),
            grant_types_supported: ["client_credentials"],
            mcp_session_endpoint: new URL("/api/auth/mcp/session", baseUrl).toString(),
            mcp_handshake_endpoint: new URL("/api/auth/mcp/handshake", baseUrl).toString(),
            mcp_servers_metadata: new URL("/.well-known/mcp-servers.json", baseUrl).toString(),
            mcp_scopes_supported: ["openid", "tasks.read"],
          }),
        );
      },
      "/api/auth/mcp/handshake": ({ res }) => {
        res
          .writeHead(200, { "Content-Type": "application/json" })
          .end(
            JSON.stringify({
              clientId: "mismatch",
              resource: "https://todo.example.com",
              scopes: ["tasks.read"],
              metadata: {
                authorization_endpoint: new URL("/oauth2/authorize", baseUrl).toString(),
                token_endpoint: new URL("/oauth2/token", baseUrl).toString(),
                introspection_endpoint: new URL("/oauth2/introspect", baseUrl).toString(),
                revocation_endpoint: new URL("/oauth2/revoke", baseUrl).toString(),
                consent_endpoint: new URL("/consent", baseUrl).toString(),
                discovery_endpoint: new URL("/.well-known/oauth-authorization-server", baseUrl).toString(),
                jwks_uri: new URL("/.well-known/jwks.json", baseUrl).toString(),
              },
              endpoints: {
                authorization: new URL("/oauth2/authorize", baseUrl).toString(),
                token: new URL("/oauth2/token", baseUrl).toString(),
                introspection: new URL("/oauth2/introspect", baseUrl).toString(),
                revocation: new URL("/oauth2/revoke", baseUrl).toString(),
                consent: new URL("/consent", baseUrl).toString(),
                discovery: new URL("/.well-known/openid-configuration", baseUrl).toString(),
                session: new URL("/api/auth/mcp/session", baseUrl).toString(),
                serversMetadata: new URL("/.well-known/mcp-servers.json", baseUrl).toString(),
              },
            }),
          );
      },
      "/api/auth/mcp/session": ({ res }) => {
        res.writeHead(401, {
          "Content-Type": "application/json",
          "WWW-Authenticate": "Bearer realm=\"Better Auth\"",
        }).end(JSON.stringify({ error: "missing_authorization" }));
      },
    });

    try {
      const result = await runCli(baseUrl);

      assert.notEqual(result.code, 0);
      assert.match(result.stderr, /Handshake clientId mismatch/);
    } finally {
      server.close();
    }
  });
});
