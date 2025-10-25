import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getMcpRegistry,
  initializeMcpRegistry,
  reloadMcpRegistry,
  reloadMcpRegistryFromEnvironment,
} from "../../dist/mcp/registry.js";

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

const buildConfig = (overrides = {}) => ({
  clients: [
    {
      id: "todo-client",
      origin: "https://todo.example.com",
      resource: "https://todo.example.com",
      redirectUri: "https://todo.example.com/oauth/callback",
      scopes: ["tasks.read"],
    },
  ],
  defaultScopes: ["openid"],
  enforceScopeAlignment: true,
  ...overrides,
});

describe("mcp/registry", () => {
  afterEach(() => {
    delete process.env.MCP_CLIENTS;
    delete process.env.MCP_DEFAULT_SCOPES;
    delete process.env.MCP_ENFORCE_SCOPE_ALIGNMENT;
    restoreEnv();
  });

  it("exposes lookup helpers for registered clients", () => {
    const config = buildConfig();
    const registry = initializeMcpRegistry(config);

    assert.deepEqual(registry.list(), config.clients);
    assert.deepEqual(registry.getById("todo-client"), config.clients[0]);
    assert.deepEqual(registry.getByOrigin("https://todo.example.com"), config.clients[0]);
    assert.deepEqual(registry.getScopeCatalog(), ["openid", "tasks.read"]);
    assert.strictEqual(getMcpRegistry(), registry);
  });

  it("refreshes clients and scope catalogue", () => {
    const registry = initializeMcpRegistry(buildConfig());
    const updated = buildConfig({
      clients: [
        {
          id: "todo-client",
          origin: "https://todo.example.com",
          resource: "https://todo.example.com",
          redirectUri: "https://todo.example.com/oauth/callback",
          scopes: ["tasks.read", "tasks.write"],
        },
        {
          id: "calendar-client",
          origin: "https://calendar.example.com",
          resource: "https://calendar.example.com",
          redirectUri: "https://calendar.example.com/oauth/callback",
          scopes: ["calendar.read"],
        },
      ],
    });

    const refreshed = reloadMcpRegistry(updated);

    assert.deepEqual(refreshed.list(), updated.clients);
    assert.deepEqual(refreshed.getScopeCatalog(), ["calendar.read", "openid", "tasks.read", "tasks.write"]);
    assert.strictEqual(getMcpRegistry(), refreshed);
  });

  it("rebuilds registry state from environment", () => {
    process.env.MCP_CLIENTS = JSON.stringify([
      {
        id: "todo-client",
        origin: "https://todo.example.com",
        resource: "https://todo.example.com",
        redirectUri: "https://todo.example.com/oauth/callback",
        scopes: ["tasks.read"],
      },
    ]);
    process.env.MCP_DEFAULT_SCOPES = "openid profile";
    process.env.MCP_ENFORCE_SCOPE_ALIGNMENT = "true";

    const registry = reloadMcpRegistryFromEnvironment({
      baseURL: "https://auth.example.com",
      allowedOrigins: ["https://todo.example.com"],
    });

    assert.deepEqual(registry.list(), [
      {
        id: "todo-client",
        origin: "https://todo.example.com",
        resource: "https://todo.example.com",
        redirectUri: "https://todo.example.com/oauth/callback",
        scopes: ["tasks.read"],
      },
    ]);
    assert.deepEqual(registry.getScopeCatalog(), ["openid", "profile", "tasks.read"]);
  });
});
