import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { ensureKeys, fetchJson, resolveBaseURL, runDiscoverySmoke } from "../check-discovery.mjs";

describe("check-discovery.mjs", () => {
  let server;
  let previousBaseURL;

  before(async () => {
    previousBaseURL = process.env.BETTER_AUTH_URL;

    server = createServer((req, res) => {
      if (req.url === "/.well-known/oauth-authorization-server") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            issuer: "http://localhost:3000",
            jwks_uri: "http://localhost:3000/.well-known/jwks.json",
            registration_endpoint: "http://localhost:3000/api/auth/oauth2/register",
            authorization_endpoint: "http://localhost:3000/api/auth/oauth2/authorize",
            token_endpoint: "http://localhost:3000/api/auth/oauth2/token",
          }),
        );
        return;
      }

      if (req.url === "/.well-known/oauth-protected-resource") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            resource: "http://localhost:3000",
            authorization_servers: ["http://localhost:3000"],
            jwks_uri: "http://localhost:3000/.well-known/jwks.json",
            scopes_supported: ["mcp"],
          }),
        );
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise((resolve, reject) => {
      server.listen(0, () => {
        const address = server.address();
        if (typeof address !== "object" || address === null) {
          reject(new Error("Could not determine mock server address"));
          return;
        }
        process.env.BETTER_AUTH_URL = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    process.env.BETTER_AUTH_URL = previousBaseURL;
    await new Promise((resolve) => server.close(resolve));
  });

  describe("helpers", () => {
    it("resolveBaseURL falls back to default", () => {
      delete process.env.BETTER_AUTH_URL;
      assert.strictEqual(resolveBaseURL(), "http://127.0.0.1:3000");
      process.env.BETTER_AUTH_URL = `http://127.0.0.1:${server.address().port}`;
    });

    it("ensureKeys throws when key is absent", () => {
      assert.throws(() => ensureKeys({}, ["key"], "context"));
    });
  });

  describe("fetchJson", () => {
    it("retrieves JSON", async () => {
      const data = await fetchJson("/.well-known/oauth-authorization-server");
      assert.ok(data.issuer);
    });

    it("rejects on failure", async () => {
      await assert.rejects(() => fetchJson("/missing"));
    });
  });

  describe("runDiscoverySmoke", () => {
    it("passes when metadata is complete", async () => {
      await runDiscoverySmoke();
    });

    it("fails when required fields are missing", async () => {
      const badServer = createServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({}));
      });

      await new Promise((resolve, reject) => {
        badServer.listen(0, async () => {
          const address = badServer.address();
          if (typeof address !== "object" || address === null) {
            reject(new Error("Could not determine mock server address"));
            return;
          }

          process.env.BETTER_AUTH_URL = `http://127.0.0.1:${address.port}`;

          await assert.rejects(runDiscoverySmoke);

          process.env.BETTER_AUTH_URL = `http://127.0.0.1:${server.address().port}`;
          badServer.close((err) => (err ? reject(err) : resolve()));
        });
      });
    });
  });
});
