#!/usr/bin/env node
import assert from "node:assert/strict";

const baseURL = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000";

async function fetchJson(path) {
  const url = new URL(path, baseURL).toString();
  const response = await fetch(url);
  assert.ok(response.ok, `Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  return response.json();
}

function ensureKeys(object, keys, context) {
  for (const key of keys) {
    assert.ok(object[key], `${context} missing required key: ${key}`);
  }
}

async function main() {
  const discovery = await fetchJson("/.well-known/oauth-authorization-server");
  ensureKeys(discovery, ["issuer", "jwks_uri", "registration_endpoint", "authorization_endpoint", "token_endpoint"], "OIDC discovery");

  const protectedResource = await fetchJson("/.well-known/oauth-protected-resource");
  ensureKeys(protectedResource, ["resource", "authorization_servers", "jwks_uri", "scopes_supported"], "Protected resource metadata");

  console.log("Discovery smoke check passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
