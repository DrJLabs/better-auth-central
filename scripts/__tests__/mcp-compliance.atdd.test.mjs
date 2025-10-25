import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptPath = path.resolve(
  fileURLToPath(new URL("../mcp-compliance.mjs", import.meta.url)),
);

const activeServers = new Set();

afterEach(() => {
  for (const server of activeServers) {
    server.close();
    activeServers.delete(server);
  }
});

const startComplianceServer = (handlers) =>
  new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const { url: reqUrl = "" } = req;
        const handler = handlers[reqUrl.split("?")[0]];
        if (!handler) {
          res
            .writeHead(404, { "Content-Type": "application/json" })
            .end(JSON.stringify({ error: "not_found", path: reqUrl }));
          return;
        }

        const chunks = [];
        for await (const chunk of req) {
          chunks.push(Buffer.from(chunk));
        }
        const body = Buffer.concat(chunks).toString("utf-8");

        await handler({ req, res, reqUrl, body });
      } catch (error) {
        res
          .writeHead(500, { "Content-Type": "application/json" })
          .end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
    });

    server.listen(0, () => {
      const address = server.address();
      if (!address || typeof address !== "object") {
        throw new Error("Unexpected server address");
      }
      const baseUrl = `http://127.0.0.1:${address.port}`;
      activeServers.add(server);
      resolve({ server, baseUrl });
    });
  });

const runCli = (baseUrl, extraArgs = []) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, `--base-url=${baseUrl}`, ...extraArgs], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => (stdout += String(chunk)));
    child.stderr.on("data", (chunk) => (stderr += String(chunk)));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });

describe("[ATDD] MCP compliance CLI (RED phase)", () => {
  it("should exercise handshake, token, introspection, and session endpoints", async () => {
    const metrics = {
      tokenCalls: 0,
      introspectionCalls: 0,
      sessionChallenges: 0,
      sessionAuthorized: 0,
    };

    const { baseUrl } = await startComplianceServer({
      "/.well-known/mcp-servers.json": ({ res }) => {
        res
          .writeHead(200, { "Content-Type": "application/json" })
          .end(
            JSON.stringify({
              generatedAt: new Date().toISOString(),
              servers: [
                {
                  id: "todo-client",
                  origin: "https://todo.example.com",
                  resource: "https://todo.example.com/api",
                  scopes: ["tasks.read"],
                  handshakeEndpoint: `${baseUrl}/api/auth/mcp/handshake?client_id=todo-client`,
                  sessionEndpoint: `${baseUrl}/api/auth/mcp/session`,
                },
              ],
            }),
          );
      },
      "/.well-known/oauth-authorization-server": ({ res }) => {
        res
          .writeHead(200, { "Content-Type": "application/json" })
          .end(
            JSON.stringify({
              issuer: `${baseUrl}`,
              authorization_endpoint: `${baseUrl}/oauth2/authorize`,
              token_endpoint: `${baseUrl}/oauth2/token`,
              introspection_endpoint: `${baseUrl}/oauth2/introspect`,
              mcp_session_endpoint: `${baseUrl}/api/auth/mcp/session`,
              mcp_handshake_endpoint: `${baseUrl}/api/auth/mcp/handshake`,
              mcp_servers_metadata: `${baseUrl}/.well-known/mcp-servers.json`,
              mcp_scopes_supported: ["tasks.read"],
            }),
          );
      },
      "/api/auth/mcp/handshake": ({ res }) => {
        res
          .writeHead(200, { "Content-Type": "application/json" })
          .end(
            JSON.stringify({
              clientId: "todo-client",
              resource: "https://todo.example.com/api",
              scopes: ["tasks.read"],
              metadata: {
                authorization_endpoint: `${baseUrl}/oauth2/authorize`,
                token_endpoint: `${baseUrl}/oauth2/token`,
                introspection_endpoint: `${baseUrl}/oauth2/introspect`,
                revocation_endpoint: `${baseUrl}/oauth2/revoke`,
                consent_endpoint: `${baseUrl}/consent`,
                discovery_endpoint: `${baseUrl}/.well-known/oauth-authorization-server`,
                jwks_uri: `${baseUrl}/.well-known/jwks.json`,
              },
              endpoints: {
                authorization: `${baseUrl}/oauth2/authorize`,
                token: `${baseUrl}/oauth2/token`,
                introspection: `${baseUrl}/oauth2/introspect`,
                revocation: `${baseUrl}/oauth2/revoke`,
                consent: `${baseUrl}/consent`,
                discovery: `${baseUrl}/.well-known/openid-configuration`,
                session: `${baseUrl}/api/auth/mcp/session`,
                serversMetadata: `${baseUrl}/.well-known/mcp-servers.json`,
              },
            }),
          );
      },
      "/oauth2/token": ({ res, body }) => {
        metrics.tokenCalls += 1;
        const form = new URLSearchParams(body);
        res
          .writeHead(200, { "Content-Type": "application/json" })
          .end(
            JSON.stringify({
              access_token: "opaque-token",
              token_type: "Bearer",
              scope: form.get("scope") ?? "tasks.read",
              expires_in: 300,
              client_id: form.get("client_id") ?? "todo-client",
              resource: form.get("resource") ?? "https://todo.example.com/api",
            }),
          );
      },
      "/oauth2/introspect": ({ res, body }) => {
        metrics.introspectionCalls += 1;
        const form = new URLSearchParams(body);
        res
          .writeHead(200, { "Content-Type": "application/json" })
          .end(
            JSON.stringify({
              active: form.get("token") === "opaque-token",
              client_id: form.get("client_id") ?? "todo-client",
              resource: "https://todo.example.com/api",
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
              clientId: "todo-client",
              scopes: ["tasks.read"],
              issuedAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 300_000).toISOString(),
              resource: "https://todo.example.com/api",
            }),
          );
      },
    });

    const result = await runCli(baseUrl);

    assert.equal(result.code, 0, result.stderr);
    assert.ok(
      metrics.tokenCalls > 0,
      "Expected compliance CLI to call token endpoint at least once (RED phase expectation)",
    );
    assert.ok(
      metrics.introspectionCalls > 0,
      "Expected compliance CLI to call introspection endpoint at least once (RED phase expectation)",
    );
    assert.ok(
      metrics.sessionChallenges > 0,
      "Expected compliance CLI to call session endpoint without authorization (RED phase expectation)",
    );
    assert.ok(
      metrics.sessionAuthorized > 0,
      "Expected compliance CLI to call session endpoint with bearer token (RED phase expectation)",
    );
  });

  it("should iterate every registered MCP client when performing compliance checks", async () => {
    const handshakeHits = new Map();

    const { baseUrl } = await startComplianceServer({
      "/.well-known/mcp-servers.json": ({ res }) => {
        res
          .writeHead(200, { "Content-Type": "application/json" })
          .end(
            JSON.stringify({
              generatedAt: new Date().toISOString(),
              servers: [
                {
                  id: "todo-client",
                  origin: "https://todo.example.com",
                  resource: "https://todo.example.com/api",
                  scopes: ["tasks.read"],
                  handshakeEndpoint: `${baseUrl}/api/auth/mcp/handshake?client_id=todo-client`,
                  sessionEndpoint: `${baseUrl}/api/auth/mcp/session`,
                },
                {
                  id: "docs-client",
                  origin: "https://docs.example.com",
                  resource: "https://docs.example.com/api",
                  scopes: ["docs.read"],
                  handshakeEndpoint: `${baseUrl}/api/auth/mcp/handshake?client_id=docs-client`,
                  sessionEndpoint: `${baseUrl}/api/auth/mcp/session`,
                },
              ],
            }),
          );
      },
      "/.well-known/oauth-authorization-server": ({ res }) => {
        res
          .writeHead(200, { "Content-Type": "application/json" })
          .end(
            JSON.stringify({
              issuer: `${baseUrl}`,
              authorization_endpoint: `${baseUrl}/oauth2/authorize`,
              token_endpoint: `${baseUrl}/oauth2/token`,
              introspection_endpoint: `${baseUrl}/oauth2/introspect`,
              mcp_session_endpoint: `${baseUrl}/api/auth/mcp/session`,
              mcp_handshake_endpoint: `${baseUrl}/api/auth/mcp/handshake`,
              mcp_servers_metadata: `${baseUrl}/.well-known/mcp-servers.json`,
              mcp_scopes_supported: ["tasks.read", "docs.read"],
            }),
          );
      },
      "/api/auth/mcp/handshake": ({ req, res, reqUrl }) => {
        const url = new URL(reqUrl, `http://${req.headers.host}`);
        const clientId = url.searchParams.get("client_id");
        handshakeHits.set(clientId, (handshakeHits.get(clientId) ?? 0) + 1);

        res
          .writeHead(200, { "Content-Type": "application/json" })
          .end(
            JSON.stringify({
              clientId,
              resource: `${clientId === "docs-client" ? "https://docs.example.com/api" : "https://todo.example.com/api"}`,
              scopes: clientId === "docs-client" ? ["docs.read"] : ["tasks.read"],
              metadata: {
                authorization_endpoint: `${baseUrl}/oauth2/authorize`,
                token_endpoint: `${baseUrl}/oauth2/token`,
                introspection_endpoint: `${baseUrl}/oauth2/introspect`,
                revocation_endpoint: `${baseUrl}/oauth2/revoke`,
                consent_endpoint: `${baseUrl}/consent`,
                discovery_endpoint: `${baseUrl}/.well-known/oauth-authorization-server`,
                jwks_uri: `${baseUrl}/.well-known/jwks.json`,
              },
              endpoints: {
                authorization: `${baseUrl}/oauth2/authorize`,
                token: `${baseUrl}/oauth2/token`,
                introspection: `${baseUrl}/oauth2/introspect`,
                revocation: `${baseUrl}/oauth2/revoke`,
                consent: `${baseUrl}/consent`,
                discovery: `${baseUrl}/.well-known/openid-configuration`,
                session: `${baseUrl}/api/auth/mcp/session`,
                serversMetadata: `${baseUrl}/.well-known/mcp-servers.json`,
              },
            }),
          );
      },
      "/oauth2/token": ({ res, body }) => {
        const form = new URLSearchParams(body);
        res
          .writeHead(200, { "Content-Type": "application/json" })
          .end(
            JSON.stringify({
              access_token: `token-${form.get("client_id") ?? "todo-client"}`,
              token_type: "Bearer",
              scope: form.get("scope") ?? "tasks.read",
              expires_in: 300,
              client_id: form.get("client_id") ?? "todo-client",
              resource: form.get("resource") ?? "https://todo.example.com/api",
            }),
          );
      },
      "/oauth2/introspect": ({ res, body }) => {
        const form = new URLSearchParams(body);
        const clientId = form.get("client_id") ?? "todo-client";
        const resource = clientId === "docs-client" ? "https://docs.example.com/api" : "https://todo.example.com/api";
        res
          .writeHead(200, { "Content-Type": "application/json" })
          .end(
            JSON.stringify({
              active: true,
              client_id: clientId,
              resource,
              issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
              scope: clientId === "docs-client" ? "docs.read" : "tasks.read",
            }),
          );
      },
      "/api/auth/mcp/session": ({ req, res }) => {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
          res
            .writeHead(401, {
              "Content-Type": "application/json",
              "WWW-Authenticate": 'Bearer realm="Better Auth"',
            })
            .end(JSON.stringify({ error: "missing_authorization" }));
          return;
        }

        const clientIdParam = authHeader.includes("token-docs-client") ? "docs-client" : "todo-client";
        const resource = clientIdParam === "docs-client" ? "https://docs.example.com/api" : "https://todo.example.com/api";
        const scope = clientIdParam === "docs-client" ? "docs.read" : "tasks.read";

        res
          .writeHead(200, { "Content-Type": "application/json" })
          .end(
            JSON.stringify({
              userId: "operator-1",
              clientId: clientIdParam,
              scopes: [scope],
              issuedAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 300_000).toISOString(),
              resource,
            }),
          );
      },
    });

    const result = await runCli(baseUrl);

    assert.equal(result.code, 0, result.stderr);
    assert.ok(handshakeHits.get("todo-client") >= 1, "Expected todo-client handshake to run");
    assert.ok(
      handshakeHits.get("docs-client") >= 1,
      "Expected CLI to run compliance checks for every registered client (RED phase expectation)",
    );
  });
});
