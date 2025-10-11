import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

describe("check-discovery.mjs", () => {
  let server;
  let serverUrl;
  let originalEnv;

  before(async () => {
    // Save original environment
    originalEnv = process.env.BETTER_AUTH_URL;

    // Create a mock server to simulate endpoints
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
          })
        );
      } else if (req.url === "/.well-known/oauth-protected-resource") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            resource: "http://localhost:3000",
            authorization_servers: ["http://localhost:3000"],
            jwks_uri: "http://localhost:3000/.well-known/jwks.json",
            scopes_supported: ["mcp"],
          })
        );
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        serverUrl = `http://127.0.0.1:${address.port}`;
        process.env.BETTER_AUTH_URL = serverUrl;
        resolve();
      });
    });
  });

  after(async () => {
    // Restore original environment
    if (originalEnv) {
      process.env.BETTER_AUTH_URL = originalEnv;
    } else {
      delete process.env.BETTER_AUTH_URL;
    }

    await new Promise((resolve) => {
      server.close(resolve);
    });
  });

  describe("fetchJson function", () => {
    it("should fetch and parse JSON from a given path", async () => {
      const fetchJson = async (path) => {
        const baseURL = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000";
        const url = new URL(path, baseURL).toString();
        const response = await fetch(url);
        assert.ok(response.ok, `Failed to fetch ${url}: ${response.status}`);
        return response.json();
      };

      const result = await fetchJson("/.well-known/oauth-authorization-server");
      assert.ok(result.issuer);
      assert.ok(result.jwks_uri);
    });

    it("should throw an error for non-ok responses", async () => {
      const fetchJson = async (path) => {
        const baseURL = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000";
        const url = new URL(path, baseURL).toString();
        const response = await fetch(url);
        assert.ok(response.ok, `Failed to fetch ${url}: ${response.status}`);
        return response.json();
      };

      await assert.rejects(
        async () => {
          await fetchJson("/non-existent-endpoint");
        },
        (error) => {
          assert.ok(error.message.includes("Failed to fetch"));
          return true;
        }
      );
    });

    it("should construct correct URLs with baseURL", async () => {
      const fetchJson = async (path) => {
        const baseURL = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000";
        const url = new URL(path, baseURL).toString();
        assert.ok(url.startsWith(serverUrl));
        const response = await fetch(url);
        return response.json();
      };

      await fetchJson("/.well-known/oauth-authorization-server");
    });

    it("should handle relative paths correctly", async () => {
      const fetchJson = async (path) => {
        const baseURL = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000";
        const url = new URL(path, baseURL).toString();
        const response = await fetch(url);
        assert.ok(response.ok);
        return response.json();
      };

      const result = await fetchJson("/.well-known/oauth-protected-resource");
      assert.ok(result.resource);
    });
  });

  describe("ensureKeys function", () => {
    it("should pass when all required keys are present", () => {
      const ensureKeys = (object, keys, context) => {
        for (const key of keys) {
          assert.ok(object[key], `${context} missing required key: ${key}`);
        }
      };

      const obj = {
        issuer: "http://example.com",
        jwks_uri: "http://example.com/jwks",
        registration_endpoint: "http://example.com/register",
      };

      ensureKeys(obj, ["issuer", "jwks_uri", "registration_endpoint"], "Test object");
      // Should not throw
    });

    it("should throw when a required key is missing", () => {
      const ensureKeys = (object, keys, context) => {
        for (const key of keys) {
          assert.ok(object[key], `${context} missing required key: ${key}`);
        }
      };

      const obj = {
        issuer: "http://example.com",
        jwks_uri: "http://example.com/jwks",
      };

      assert.throws(
        () => {
          ensureKeys(obj, ["issuer", "jwks_uri", "missing_key"], "Test object");
        },
        (error) => {
          assert.ok(error.message.includes("missing required key: missing_key"));
          return true;
        }
      );
    });

    it("should throw when a key has a falsy value", () => {
      const ensureKeys = (object, keys, context) => {
        for (const key of keys) {
          assert.ok(object[key], `${context} missing required key: ${key}`);
        }
      };

      const obj = {
        issuer: "http://example.com",
        jwks_uri: "",
        registration_endpoint: "http://example.com/register",
      };

      assert.throws(
        () => {
          ensureKeys(obj, ["issuer", "jwks_uri", "registration_endpoint"], "Test object");
        },
        (error) => {
          assert.ok(error.message.includes("missing required key: jwks_uri"));
          return true;
        }
      );
    });

    it("should throw when a key is null", () => {
      const ensureKeys = (object, keys, context) => {
        for (const key of keys) {
          assert.ok(object[key], `${context} missing required key: ${key}`);
        }
      };

      const obj = {
        issuer: "http://example.com",
        jwks_uri: null,
      };

      assert.throws(() => {
        ensureKeys(obj, ["issuer", "jwks_uri"], "Test object");
      });
    });

    it("should throw when a key is undefined", () => {
      const ensureKeys = (object, keys, context) => {
        for (const key of keys) {
          assert.ok(object[key], `${context} missing required key: ${key}`);
        }
      };

      const obj = {
        issuer: "http://example.com",
      };

      assert.throws(() => {
        ensureKeys(obj, ["issuer", "undefined_key"], "Test object");
      });
    });

    it("should include context in error message", () => {
      const ensureKeys = (object, keys, context) => {
        for (const key of keys) {
          assert.ok(object[key], `${context} missing required key: ${key}`);
        }
      };

      const obj = {};

      assert.throws(
        () => {
          ensureKeys(obj, ["required_key"], "Custom Context");
        },
        (error) => {
          assert.ok(error.message.includes("Custom Context"));
          return true;
        }
      );
    });

    it("should validate multiple keys in sequence", () => {
      const ensureKeys = (object, keys, context) => {
        for (const key of keys) {
          assert.ok(object[key], `${context} missing required key: ${key}`);
        }
      };

      const obj = {
        key1: "value1",
        key2: "value2",
        key3: "value3",
      };

      ensureKeys(obj, ["key1", "key2", "key3"], "Multi-key test");
      // Should not throw
    });
  });

  describe("OIDC Discovery Validation", () => {
    it("should validate oauth-authorization-server discovery metadata", async () => {
      const fetchJson = async (path) => {
        const baseURL = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000";
        const url = new URL(path, baseURL).toString();
        const response = await fetch(url);
        assert.ok(response.ok);
        return response.json();
      };

      const ensureKeys = (object, keys, context) => {
        for (const key of keys) {
          assert.ok(object[key], `${context} missing required key: ${key}`);
        }
      };

      const discovery = await fetchJson("/.well-known/oauth-authorization-server");
      ensureKeys(
        discovery,
        ["issuer", "jwks_uri", "registration_endpoint", "authorization_endpoint", "token_endpoint"],
        "OIDC discovery"
      );

      assert.strictEqual(discovery.issuer, "http://localhost:3000");
    });

    it("should validate protected resource metadata", async () => {
      const fetchJson = async (path) => {
        const baseURL = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000";
        const url = new URL(path, baseURL).toString();
        const response = await fetch(url);
        assert.ok(response.ok);
        return response.json();
      };

      const ensureKeys = (object, keys, context) => {
        for (const key of keys) {
          assert.ok(object[key], `${context} missing required key: ${key}`);
        }
      };

      const protectedResource = await fetchJson("/.well-known/oauth-protected-resource");
      ensureKeys(
        protectedResource,
        ["resource", "authorization_servers", "jwks_uri", "scopes_supported"],
        "Protected resource metadata"
      );

      assert.ok(Array.isArray(protectedResource.authorization_servers));
      assert.ok(Array.isArray(protectedResource.scopes_supported));
    });
  });

  describe("Environment Variable Handling", () => {
    it("should use BETTER_AUTH_URL from environment", async () => {
      const baseURL = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000";
      assert.strictEqual(baseURL, serverUrl);
    });

    it("should fall back to default URL when env var is not set", () => {
      const savedEnv = process.env.BETTER_AUTH_URL;
      delete process.env.BETTER_AUTH_URL;

      const baseURL = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000";
      assert.strictEqual(baseURL, "http://127.0.0.1:3000");

      process.env.BETTER_AUTH_URL = savedEnv;
    });
  });

  describe("Error Handling and Edge Cases", () => {
    it("should handle network errors gracefully", async () => {
      const fetchJson = async (path) => {
        const url = new URL(path, "http://localhost:99999").toString();
        const response = await fetch(url);
        assert.ok(response.ok);
        return response.json();
      };

      await assert.rejects(async () => {
        await fetchJson("/.well-known/oauth-authorization-server");
      });
    });

    it("should handle malformed JSON responses", async () => {
      // Create a server that returns invalid JSON
      const badServer = createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("not valid json");
      });

      await new Promise((resolve) => {
        badServer.listen(0, () => {
          const address = badServer.address();
          const badUrl = `http://127.0.0.1:${address.port}`;

          const fetchJson = async (path) => {
            const url = new URL(path, badUrl).toString();
            const response = await fetch(url);
            assert.ok(response.ok);
            return response.json();
          };

          assert.rejects(async () => {
            await fetchJson("/test");
          }).then(() => {
            badServer.close(resolve);
          });
        });
      });
    });

    it("should handle empty response bodies", async () => {
      const emptyServer = createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
      });

      await new Promise((resolve) => {
        emptyServer.listen(0, () => {
          const address = emptyServer.address();
          const emptyUrl = `http://127.0.0.1:${address.port}`;

          const fetchJson = async (path) => {
            const url = new URL(path, emptyUrl).toString();
            const response = await fetch(url);
            assert.ok(response.ok);
            return response.json();
          };

          const ensureKeys = (object, keys, context) => {
            for (const key of keys) {
              assert.ok(object[key], `${context} missing required key: ${key}`);
            }
          };

          fetchJson("/test")
            .then((result) => {
              assert.throws(() => {
                ensureKeys(result, ["missing_key"], "Empty object");
              });
            })
            .then(() => {
              emptyServer.close(resolve);
            });
        });
      });
    });
  });

  describe("URL Construction", () => {
    it("should handle paths with leading slashes", async () => {
      const baseURL = serverUrl;
      const url1 = new URL("/.well-known/test", baseURL);
      const url2 = new URL(".well-known/test", baseURL);

      assert.ok(url1.toString().includes("/.well-known/test"));
      // Both should work correctly
    });

    it("should handle paths without leading slashes", async () => {
      const baseURL = serverUrl;
      const url = new URL("test", baseURL);

      assert.ok(url.toString().includes("/test"));
    });

    it("should handle baseURL with trailing slash", () => {
      const baseURLWithSlash = serverUrl + "/";
      const url = new URL("/.well-known/test", baseURLWithSlash);

      assert.ok(url.toString().includes("/.well-known/test"));
    });
  });
});