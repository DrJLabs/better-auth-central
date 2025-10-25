import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { loadMcpConfig, resolveScopeSet } from "../../dist/config/mcp.js";

const originalEnv = {
  MCP_CLIENTS: process.env.MCP_CLIENTS,
  MCP_DEFAULT_SCOPES: process.env.MCP_DEFAULT_SCOPES,
  MCP_ENFORCE_SCOPE_ALIGNMENT: process.env.MCP_ENFORCE_SCOPE_ALIGNMENT,
};

const setEnvVar = (key, value) => {
  if (value === undefined || value === null) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
};

const restoreEnv = () => {
  setEnvVar("MCP_CLIENTS", originalEnv.MCP_CLIENTS ?? undefined);
  setEnvVar("MCP_DEFAULT_SCOPES", originalEnv.MCP_DEFAULT_SCOPES ?? undefined);
  setEnvVar("MCP_ENFORCE_SCOPE_ALIGNMENT", originalEnv.MCP_ENFORCE_SCOPE_ALIGNMENT ?? undefined);
};

const baseUrl = "https://auth.example.com";
const trustedOrigins = ["https://todo.example.com"];

const baseClient = {
  id: "todo-client",
  origin: "https://todo.example.com",
  resource: "https://todo.example.com",
  redirectUri: "https://todo.example.com/oauth/callback",
};

describe("config/mcp loadMcpConfig", () => {
  afterEach(() => {
    delete process.env.MCP_CLIENTS;
    delete process.env.MCP_DEFAULT_SCOPES;
    delete process.env.MCP_ENFORCE_SCOPE_ALIGNMENT;
    restoreEnv();
  });

  it("applies default scopes when client configuration omits scopes", () => {
    process.env.MCP_CLIENTS = JSON.stringify([baseClient]);
    process.env.MCP_DEFAULT_SCOPES = "openid profile";

    const config = loadMcpConfig(baseUrl, trustedOrigins);

    assert.deepEqual(config.clients, [
      {
        ...baseClient,
        scopes: ["openid", "profile"],
      },
    ]);
    assert.deepEqual(config.defaultScopes, ["openid", "profile"]);
    assert.equal(config.enforceScopeAlignment, true);
    const scopeSet = resolveScopeSet(config);
    assert.deepEqual([...scopeSet].sort(), ["openid", "profile"]);
  });

  it("honours explicit client scopes and boolean alignment flag", () => {
    process.env.MCP_CLIENTS = JSON.stringify([
      {
        ...baseClient,
        scopes: ["tasks.read"],
      },
    ]);
    process.env.MCP_DEFAULT_SCOPES = "";
    process.env.MCP_ENFORCE_SCOPE_ALIGNMENT = "false";

    const config = loadMcpConfig(baseUrl, trustedOrigins);

    assert.deepEqual(config.clients[0].scopes, ["tasks.read"]);
    assert.deepEqual(config.defaultScopes, ["openid"]);
    assert.equal(config.enforceScopeAlignment, false);
    const scopeSet = resolveScopeSet(config);
    assert.deepEqual([...scopeSet].sort(), ["openid", "tasks.read"]);
  });

  it("throws when client origin is not trusted", () => {
    process.env.MCP_CLIENTS = JSON.stringify([
      {
        ...baseClient,
        origin: "https://untrusted.example.com",
      },
    ]);

    assert.throws(
      () => loadMcpConfig(baseUrl, trustedOrigins),
      /Client origin https:\/\/untrusted\.example\.com is not present in trusted origins/,
    );
  });

  it("throws when MCP_CLIENTS cannot be parsed", () => {
    process.env.MCP_CLIENTS = "{not-json}";

    assert.throws(
      () => loadMcpConfig(baseUrl, trustedOrigins),
      /Failed to parse MCP_CLIENTS/,
    );
  });
});
