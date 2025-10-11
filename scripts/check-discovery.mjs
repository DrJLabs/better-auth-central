#!/usr/bin/env node
import assert from "node:assert/strict";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";

export const resolveBaseURL = () => process.env.BETTER_AUTH_URL ?? DEFAULT_BASE_URL;

export const fetchJson = async (path, baseURL = resolveBaseURL()) => {
  const url = new URL(path, baseURL).toString();
  const response = await fetch(url);
  assert.ok(response.ok, `Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  return response.json();
};

export const ensureKeys = (object, keys, context) => {
  for (const key of keys) {
    assert.ok(object[key], `${context} missing required key: ${key}`);
  }
};

export const runDiscoverySmoke = async () => {
  const baseURL = resolveBaseURL();
  const discovery = await fetchJson("/.well-known/oauth-authorization-server", baseURL);
  ensureKeys(
    discovery,
    ["issuer", "jwks_uri", "registration_endpoint", "authorization_endpoint", "token_endpoint"],
    "OIDC discovery",
  );

  const protectedResource = await fetchJson("/.well-known/oauth-protected-resource", baseURL);
  ensureKeys(
    protectedResource,
    ["resource", "authorization_servers", "jwks_uri", "scopes_supported"],
    "Protected resource metadata",
  );

  console.log("Discovery smoke check passed");
};

const isCliInvocation = () => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === new URL(process.argv[1], "file://").href;
  } catch {
    return false;
  }
};

if (isCliInvocation()) {
  runDiscoverySmoke().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
