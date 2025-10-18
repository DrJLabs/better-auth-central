#!/usr/bin/env node
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.DISCOVERY_TIMEOUT_MS ?? "10000", 10);
const DISCOVERY_TIMEOUT_MS = Number.isNaN(DEFAULT_TIMEOUT_MS) ? 10000 : DEFAULT_TIMEOUT_MS;

export const resolveBaseURL = (override) => {
  if (override) {
    return override;
  }

  return process.env.BETTER_AUTH_URL ?? DEFAULT_BASE_URL;
};

export const fetchJson = async (path, baseURL = resolveBaseURL()) => {
  const url = new URL(path, baseURL).toString();
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS) });
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      throw new Error(`Timed out fetching ${url} after ${DISCOVERY_TIMEOUT_MS}ms`);
    }
    throw error;
  }
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

export const runDiscoverySmoke = async (baseURL) => {
  const target = resolveBaseURL(baseURL);
  console.log(`Running discovery smoke check against ${target}`);

  const discovery = await fetchJson("/.well-known/oauth-authorization-server", target);
  ensureKeys(
    discovery,
    ["issuer", "jwks_uri", "registration_endpoint", "authorization_endpoint", "token_endpoint"],
    "OIDC discovery",
  );

  const protectedResource = await fetchJson("/.well-known/oauth-protected-resource", target);
  ensureKeys(
    protectedResource,
    ["resource", "authorization_servers", "jwks_uri", "scopes_supported"],
    "Protected resource metadata",
  );

  console.log("Discovery smoke check passed");
};

const parseCliBaseUrl = (argv) => {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--base-url=")) {
      const value = arg.slice("--base-url=".length);
      if (value.length === 0) {
        throw new Error("Missing value for --base-url. Example: --base-url=https://auth.example.com");
      }
      return value;
    }
    if (arg === "--base-url") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --base-url. Example: --base-url=https://auth.example.com");
      }
      return value;
    }
  }
  return undefined;
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
  try {
    const cliBaseUrl = parseCliBaseUrl(process.argv.slice(2));
    runDiscoverySmoke(cliBaseUrl).catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
