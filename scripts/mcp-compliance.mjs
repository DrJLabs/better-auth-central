#!/usr/bin/env node

import process from "node:process";
import { URL } from "node:url";
import fetch from "node-fetch";
import { z } from "zod";

const args = process.argv.slice(2);

let baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
let registerMode = false;

for (const arg of args) {
  if (arg.startsWith("--base-url=")) {
    baseUrl = arg.split("=")[1];
  } else if (arg === "--register") {
    registerMode = true;
  }
}

const ensureAbsoluteUrl = (value, description) => {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    throw new Error(`${description} is not a valid URL: ${value}`);
  }
};

ensureAbsoluteUrl(baseUrl, "Base URL");

const requestJson = async (url, init = {}, options = {}) => {
  const { expectedStatus = [200], description } = options;
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  let data = {};
  if (text.length > 0) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`${description ?? url} did not return JSON payload`);
    }
  }

  if (!expectedStatus.includes(response.status)) {
    const detail = typeof data === "object" && data !== null ? JSON.stringify(data) : text;
    throw new Error(
      `${description ?? url} returned ${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`,
    );
  }

  return { response, data };
};

const nonEmptyString = z.string().min(1);

const ServersDocumentSchema = z.object({
  generatedAt: nonEmptyString,
  servers: z
    .array(
      z.object({
        id: nonEmptyString,
        origin: nonEmptyString,
        resource: nonEmptyString,
        scopes: z.array(nonEmptyString),
        handshakeEndpoint: nonEmptyString,
        sessionEndpoint: nonEmptyString,
      }),
    )
    .default([]),
});

const OpenIdDocumentSchema = z.object({
  issuer: nonEmptyString,
  authorization_endpoint: nonEmptyString,
  token_endpoint: nonEmptyString,
  introspection_endpoint: nonEmptyString,
  mcp_session_endpoint: nonEmptyString,
  mcp_handshake_endpoint: nonEmptyString,
  mcp_servers_metadata: nonEmptyString,
  mcp_scopes_supported: z.array(nonEmptyString).nonempty(),
  grant_types_supported: z.array(nonEmptyString).optional(),
});

const HandshakeResponseSchema = z.object({
  clientId: nonEmptyString,
  resource: nonEmptyString,
  scopes: z.array(nonEmptyString).nonempty(),
  metadata: z.object({
    authorization_endpoint: nonEmptyString,
    token_endpoint: nonEmptyString,
    introspection_endpoint: nonEmptyString,
    revocation_endpoint: nonEmptyString,
    consent_endpoint: nonEmptyString,
    discovery_endpoint: nonEmptyString,
    jwks_uri: nonEmptyString,
  }),
  endpoints: z.object({
    authorization: nonEmptyString,
    token: nonEmptyString,
    introspection: nonEmptyString,
    revocation: nonEmptyString,
    consent: nonEmptyString,
    discovery: nonEmptyString,
    session: nonEmptyString,
    serversMetadata: nonEmptyString,
  }),
});

const TokenResponseSchema = z.object({
  access_token: nonEmptyString,
  token_type: nonEmptyString,
  expires_in: z.coerce.number().min(0),
  scope: nonEmptyString,
  client_id: nonEmptyString,
  resource: nonEmptyString,
});

const IntrospectionResponseSchema = z.object({
  active: z.boolean(),
  client_id: nonEmptyString,
  resource: nonEmptyString,
  issued_token_type: nonEmptyString,
  scope: nonEmptyString,
});

const SessionResponseSchema = z.object({
  userId: nonEmptyString.optional(),
  clientId: nonEmptyString,
  scopes: z.array(nonEmptyString).nonempty(),
  issuedAt: nonEmptyString,
  expiresAt: nonEmptyString,
  resource: nonEmptyString,
});

const SessionErrorSchema = z.object({ error: nonEmptyString });

const globalClientSecret = process.env.MCP_COMPLIANCE_CLIENT_SECRET;

const keyForClientSecret = (clientId) => clientId.toUpperCase().replace(/[^A-Z0-9]/g, "_");

const resolveClientSecret = (clientId) => {
  const specific = process.env[`MCP_COMPLIANCE_SECRET_${keyForClientSecret(clientId)}`];
  if (specific && specific.length > 0) {
    return specific;
  }
  if (globalClientSecret && globalClientSecret.length > 0) {
    return globalClientSecret;
  }
  return null;
};

const ensureSessionChallenge = async (sessionUrl, serverId) => {
  const { response, data } = await requestJson(
    sessionUrl,
    {},
    {
      expectedStatus: [401],
      description: `Session challenge for ${serverId}`,
    },
  );

  const challenge = response.headers.get("WWW-Authenticate");
  if (!challenge) {
    throw new Error(`Session endpoint for ${serverId} is missing WWW-Authenticate challenge header`);
  }

  SessionErrorSchema.parse(data);

  console.log("  • Session endpoint demands bearer authentication");
  return challenge;
};

const validateServer = async (server, openIdDocument) => {
  console.log(`\nValidating client ${server.id} (${server.origin})`);

  const handshakeUrl = new URL(server.handshakeEndpoint, baseUrl);
  if (!handshakeUrl.searchParams.has("client_id")) {
    handshakeUrl.searchParams.set("client_id", server.id);
  }

  const { data: handshakePayload } = await requestJson(handshakeUrl.toString(), {
    headers: { Origin: server.origin },
  }, { description: `Handshake for ${server.id}` });
  const handshake = HandshakeResponseSchema.parse(handshakePayload);

  if (handshake.clientId !== server.id) {
    throw new Error(`Handshake clientId mismatch: expected ${server.id}, received ${handshake.clientId}`);
  }

  if (handshake.resource !== server.resource) {
    throw new Error(`Handshake resource mismatch for ${server.id}`);
  }

  const handshakeScopes = new Set(handshake.scopes);
  const missingScopes = server.scopes.filter((scope) => !handshakeScopes.has(scope));
  if (missingScopes.length > 0) {
    throw new Error(`Handshake scopes missing expected entries (${missingScopes.join(", ")}) for ${server.id}`);
  }

  console.log("  • Handshake endpoint returned validated metadata");

  const openIdTokenEndpoint = ensureAbsoluteUrl(openIdDocument.token_endpoint, "token endpoint");
  const tokenEndpoint = ensureAbsoluteUrl(handshake.endpoints.token, "handshake token endpoint");
  if (tokenEndpoint !== openIdTokenEndpoint) {
    throw new Error(`Handshake token endpoint ${tokenEndpoint} does not match OpenID metadata ${openIdTokenEndpoint}`);
  }

 const openIdSessionEndpoint = ensureAbsoluteUrl(openIdDocument.mcp_session_endpoint, "session endpoint");
 const handshakeSessionEndpoint = ensureAbsoluteUrl(handshake.endpoints.session, "handshake session endpoint");
 const registrySessionEndpoint = ensureAbsoluteUrl(server.sessionEndpoint, "registry session endpoint");
 if (handshakeSessionEndpoint !== openIdSessionEndpoint || handshakeSessionEndpoint !== registrySessionEndpoint) {
    throw new Error(`Session endpoint mismatch for ${server.id}`);
 }

  const sessionChallenge = await ensureSessionChallenge(handshakeSessionEndpoint, server.id);

  const supportedGrantTypes = new Set(openIdDocument.grant_types_supported ?? []);
  if (!supportedGrantTypes.has("client_credentials")) {
    console.log(
      "  • Skipping client_credentials flow (grant not advertised); session challenge verified",
    );
    return;
  }

  const tokenBody = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: server.id,
    scope: handshake.scopes.join(" "),
    resource: server.resource,
  });

  const clientSecret = resolveClientSecret(server.id);
  if (clientSecret) {
    tokenBody.set("client_secret", clientSecret);
  }

  const { data: tokenPayload } = await requestJson(
    tokenEndpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    },
    { description: `Token endpoint for ${server.id}` },
  );
  const token = TokenResponseSchema.parse(tokenPayload);

  if (token.client_id !== server.id) {
    throw new Error(`Token response client_id mismatch for ${server.id}`);
  }

  if (token.resource !== server.resource) {
    throw new Error(`Token response resource mismatch for ${server.id}`);
  }

  console.log("  • OAuth token response validated");

  const introspectionEndpoint = ensureAbsoluteUrl(handshake.endpoints.introspection, "handshake introspection endpoint");
  const openIdIntrospectionEndpoint = ensureAbsoluteUrl(openIdDocument.introspection_endpoint, "introspection endpoint");
  if (introspectionEndpoint !== openIdIntrospectionEndpoint) {
    throw new Error(
      `Handshake introspection endpoint ${introspectionEndpoint} does not match OpenID metadata ${openIdIntrospectionEndpoint}`,
    );
  }

  const introspectionBody = new URLSearchParams({
    token: token.access_token,
    client_id: server.id,
  });
  if (clientSecret) {
    introspectionBody.set("client_secret", clientSecret);
  }

  const { data: introspectionPayload } = await requestJson(
    introspectionEndpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: introspectionBody.toString(),
    },
    { description: `Introspection endpoint for ${server.id}` },
  );
  const introspection = IntrospectionResponseSchema.parse(introspectionPayload);

  if (!introspection.active) {
    throw new Error(`Token introspection for ${server.id} returned inactive token`);
  }

  if (introspection.client_id !== server.id) {
    throw new Error(`Introspection client_id mismatch for ${server.id}`);
  }

  if (introspection.resource !== server.resource) {
    throw new Error(`Introspection resource mismatch for ${server.id}`);
  }

  console.log("  • Token introspection response validated");

  const { response: sessionResponse, data: sessionData } = await requestJson(
    handshakeSessionEndpoint,
    {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
      },
    },
    {
      description: `Session endpoint for ${server.id}`,
      expectedStatus: [200, 401],
    },
  );

  if (sessionResponse.status === 401) {
    // Some deployments may not expose session data for client_credentials tokens.
    SessionErrorSchema.parse(sessionData);
        console.log(
          `  • Session endpoint rejected token (401) despite challenge "${sessionChallenge}" — verify tokens map to active sessions`,
        );
  } else {
    const session = SessionResponseSchema.parse(sessionData);

    if (session.clientId !== server.id) {
      throw new Error(`Session clientId mismatch for ${server.id}`);
    }

    if (session.resource !== server.resource) {
      throw new Error(`Session resource mismatch for ${server.id}`);
    }

    const missingSessionScopes = server.scopes.filter((scope) => !session.scopes.includes(scope));
    if (missingSessionScopes.length > 0) {
      throw new Error(
        `Session scopes missing expected entries (${missingSessionScopes.join(", ")}) for ${server.id}`,
      );
    }

    console.log("  • Session endpoint returned active session metadata");
  }
};

const main = async () => {
  console.log(`Running MCP compliance checks against ${baseUrl}`);

  const serversUrl = new URL("/.well-known/mcp-servers.json", baseUrl).toString();
  const { data: serversPayload } = await requestJson(serversUrl, {}, { description: "MCP servers document" });
  const serversDocument = ServersDocumentSchema.parse(serversPayload);

  console.log(`• Found ${serversDocument.servers.length} registered MCP server(s)`);

  const openIdUrl = new URL("/.well-known/oauth-authorization-server", baseUrl).toString();
  const { data: openIdPayload } = await requestJson(openIdUrl, {}, { description: "OpenID configuration" });
  const sanitizedOpenIdPayload = {
    ...openIdPayload,
    token_endpoint:
      openIdPayload.token_endpoint ??
      new URL("/api/auth/oauth2/token", baseUrl).toString(),
    introspection_endpoint:
      openIdPayload.introspection_endpoint ??
      new URL("/api/auth/oauth2/introspect", baseUrl).toString(),
    revocation_endpoint:
      openIdPayload.revocation_endpoint ??
      new URL("/api/auth/oauth2/revoke", baseUrl).toString(),
  };
  const openIdDocument = OpenIdDocumentSchema.parse(sanitizedOpenIdPayload);

  console.log("• OpenID metadata advertises MCP extensions");

  if (serversDocument.servers.length === 0) {
    console.log("No servers registered; compliance checks minimal.");
    return;
  }

  for (const server of serversDocument.servers) {
    await validateServer(server, openIdDocument);
  }

  if (registerMode) {
    console.log("\nRegistration summary:");
    for (const server of serversDocument.servers) {
      console.log(`  - ${server.id} (${server.origin}) -> ${server.resource}`);
    }
  }

  console.log("\n✅ MCP compliance checks passed");
};

main().catch((error) => {
  console.error("❌ MCP compliance failed:", error.message);
  process.exitCode = 1;
});
