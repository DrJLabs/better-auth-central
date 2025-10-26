import { OAuthIntrospectionResponseBaseSchema, OAuthIntrospectionResponseSchema, OAuthTokenResponseSchema, McpHandshakeResponseSchema, McpHandshakeMetadataSchema, McpSessionSchema } from "./schemas";
import type { MCPClient } from "./registry";

const TOKEN_TYPE = "Bearer";
const DEFAULT_ISSUED_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";

const toScopeArray = (value: string | string[] | null | undefined): string[] => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.filter((item) => item.length > 0);
  }

  return value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const scopeString = (scopes: string[]): string => scopes.join(" ");

export interface TokenResponseContext {
  payload: unknown;
  client?: MCPClient;
  resolvedScopes: string[];
  defaultScopes: string[];
}

export const buildTokenResponse = (context: TokenResponseContext) => {
  const partialSchema = OAuthTokenResponseSchema.partial();
  const parsed = partialSchema.parse(context.payload ?? {});

  const client = context.client;
  const resolvedClientId = parsed.client_id ?? client?.id;
  const resolvedResource = parsed.resource ?? client?.resource;
  const fallbackScopes = context.resolvedScopes.length > 0
    ? context.resolvedScopes
    : client?.scopes ?? context.defaultScopes;
  const resolvedScope = parsed.scope ?? scopeString(fallbackScopes);

  if (!resolvedClientId || !resolvedResource) {
    throw new Error("Unable to determine client metadata for token response");
  }

  return OAuthTokenResponseSchema.parse({
    ...parsed,
    token_type: parsed.token_type ?? TOKEN_TYPE,
    client_id: resolvedClientId,
    resource: resolvedResource,
    scope: resolvedScope,
  });
};

export interface IntrospectionResponseContext {
  payload: unknown;
  client?: MCPClient;
  session?: {
    clientId?: string;
    resource?: string;
    scopes?: string[];
  } | null;
  defaultScopes: string[];
}

export const buildIntrospectionResponse = (context: IntrospectionResponseContext) => {
  const partialSchema = OAuthIntrospectionResponseBaseSchema.partial();
  const parsed = partialSchema.parse(context.payload ?? {});

  const session = context.session ?? undefined;
  const client = context.client;

  const isActive = parsed.active ?? false;

  if (!isActive) {
    return OAuthIntrospectionResponseSchema.parse({
      active: false,
      client_id: parsed.client_id,
      resource: parsed.resource,
      issued_token_type: parsed.issued_token_type,
      scope: parsed.scope,
    });
  }

  const resolvedClientId = parsed.client_id ?? session?.clientId ?? client?.id;
  const resolvedResource = parsed.resource ?? session?.resource ?? client?.resource;
  const resolvedScopeSource = parsed.scope
    ? toScopeArray(parsed.scope)
    : session?.scopes ?? client?.scopes ?? context.defaultScopes;

  if (!resolvedClientId || !resolvedResource) {
    throw new Error("Unable to determine client metadata for introspection response");
  }

  return OAuthIntrospectionResponseSchema.parse({
    ...parsed,
    active: true,
    client_id: resolvedClientId,
    resource: resolvedResource,
    scope: scopeString(resolvedScopeSource),
    issued_token_type: parsed.issued_token_type ?? DEFAULT_ISSUED_TOKEN_TYPE,
  });
};

export interface SessionResponseContext {
  session: unknown;
  client?: MCPClient;
  fallbackTtlSeconds?: number;
}

const computeExpiry = (issuedAtIso: string | undefined, ttlSeconds: number): string => {
  const issued = issuedAtIso ? Date.parse(issuedAtIso) : Date.now();
  const baseMs = Number.isFinite(issued) ? issued : Date.now();
  const expires = baseMs + ttlSeconds * 1000;
  return new Date(expires).toISOString();
};

export const buildSessionResponse = (context: SessionResponseContext) => {
  const partialSchema = McpSessionSchema.partial();
  const parsed = partialSchema.parse(context.session ?? {});
  const client = context.client;

  const resolvedScopes = parsed.scopes?.length
    ? parsed.scopes
    : client?.scopes ?? [];

  if (resolvedScopes.length === 0) {
    throw new Error("Session response missing scope information");
  }

  const issuedAt = parsed.issuedAt ?? new Date().toISOString();
  const ttlSeconds = context.fallbackTtlSeconds ?? 300;
  const expiresAt = parsed.expiresAt ?? computeExpiry(issuedAt, ttlSeconds);
  const resource = parsed.resource ?? client?.resource;

  if (!resource) {
    throw new Error("Session response missing resource information");
  }

  return McpSessionSchema.parse({
    ...parsed,
    scopes: resolvedScopes,
    issuedAt,
    expiresAt,
    resource,
  });
};

interface HandshakeContext {
  client: MCPClient;
  metadata: Record<string, unknown>;
  baseUrl: string;
}

const ensureUrl = (value: unknown, fallback: string): string => {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return fallback;
};

export const buildHandshakeResponse = ({ client, metadata, baseUrl }: HandshakeContext) => {
  const base = new URL(baseUrl);

  const partialMetadata = McpHandshakeMetadataSchema.partial().parse({
    authorization_endpoint: metadata.authorization_endpoint,
    token_endpoint: metadata.token_endpoint,
    introspection_endpoint: metadata.introspection_endpoint,
    revocation_endpoint: metadata.revocation_endpoint,
    consent_endpoint: metadata.consent_endpoint,
    discovery_endpoint: (metadata as { discovery_endpoint?: unknown }).discovery_endpoint,
    jwks_uri: metadata.jwks_uri,
  });

  const resolvedMetadataBase: Record<string, string> = {
    authorization_endpoint: ensureUrl(
      partialMetadata.authorization_endpoint,
      new URL("/api/auth/oauth2/authorize", base).toString(),
    ),
    token_endpoint: ensureUrl(
      partialMetadata.token_endpoint,
      new URL("/api/auth/oauth2/token", base).toString(),
    ),
    introspection_endpoint: ensureUrl(
      partialMetadata.introspection_endpoint,
      new URL("/api/auth/oauth2/introspect", base).toString(),
    ),
    consent_endpoint: ensureUrl(
      partialMetadata.consent_endpoint,
      new URL("/consent", base).toString(),
    ),
    discovery_endpoint: ensureUrl(
      partialMetadata.discovery_endpoint,
      new URL("/.well-known/openid-configuration", base).toString(),
    ),
    jwks_uri: ensureUrl(partialMetadata.jwks_uri, new URL("/.well-known/jwks.json", base).toString()),
  };

  if (typeof partialMetadata.revocation_endpoint === "string" && partialMetadata.revocation_endpoint.length > 0) {
    resolvedMetadataBase.revocation_endpoint = ensureUrl(
      partialMetadata.revocation_endpoint,
      new URL("/api/auth/oauth2/revoke", base).toString(),
    );
  }

  const resolvedMetadata = McpHandshakeMetadataSchema.parse(resolvedMetadataBase);

  const sessionEndpoint = ensureUrl(
    (metadata as { mcp_session_endpoint?: unknown }).mcp_session_endpoint,
    new URL("/api/auth/mcp/session", base).toString(),
  );
  const serversMetadata = ensureUrl(
    (metadata as { mcp_servers_metadata?: unknown }).mcp_servers_metadata,
    new URL("/.well-known/mcp-servers.json", base).toString(),
  );

  return McpHandshakeResponseSchema.parse({
    clientId: client.id,
    resource: client.resource,
    scopes: client.scopes,
    metadata: resolvedMetadata,
    endpoints: {
      authorization: resolvedMetadata.authorization_endpoint,
      token: resolvedMetadata.token_endpoint,
      introspection: resolvedMetadata.introspection_endpoint,
      ...(resolvedMetadata.revocation_endpoint ? { revocation: resolvedMetadata.revocation_endpoint } : {}),
      consent: resolvedMetadata.consent_endpoint,
      discovery: resolvedMetadata.discovery_endpoint,
      session: sessionEndpoint,
      serversMetadata,
    },
  });
};

export const mergeScopes = (...values: Array<string | string[] | null | undefined>): string[] => {
  const result = new Set<string>();
  for (const value of values) {
    for (const scope of toScopeArray(value)) {
      result.add(scope);
    }
  }
  return Array.from(result);
};
