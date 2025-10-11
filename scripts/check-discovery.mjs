#!/usr/bin/env node
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";

export const resolveBaseURL = () => process.env.BETTER_AUTH_URL ?? DEFAULT_BASE_URL;

export const fetchJson = async (path, baseURL = resolveBaseURL()) => {
  const url = new URL(path, baseURL).toString();
  const response = await fetch(url);
  assert.ok(response.ok, `Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  try {
    return await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse JSON from ${url}: ${message}`);
  }
};

export const ensureKeys = (object, keys, context) => {
  for (const key of keys) {
    assert.ok(key in object, `${context} missing required key: ${key}`);
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
    return import.meta.url === pathToFileURL(process.argv[1]).href;
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
