import type { MCPClient, MCPRegistry } from "./registry";

export interface McpServersDocument {
  generatedAt: string;
  servers: Array<{
    id: string;
    origin: string;
    resource: string;
    scopes: string[];
    handshakeEndpoint: string;
    sessionEndpoint: string;
  }>;
}

export const buildMcpServersDocument = (baseURL: string, clients: MCPClient[]): McpServersDocument => {
  const sessionEndpoint = new URL("/api/auth/mcp/session", baseURL).toString();
  const handshakeBase = new URL("/api/auth/mcp/handshake", baseURL);

  return {
    generatedAt: new Date().toISOString(),
    servers: clients.map((client) => {
      const handshakeUrl = new URL(handshakeBase);
      handshakeUrl.searchParams.set("client_id", client.id);

      return {
        id: client.id,
        origin: client.origin,
        resource: client.resource,
        scopes: client.scopes,
        handshakeEndpoint: handshakeUrl.toString(),
        sessionEndpoint,
      };
    }),
  } satisfies McpServersDocument;
};

export const enrichOpenIdConfiguration = <T extends Record<string, unknown>>(
  baseURL: string,
  registry: MCPRegistry,
  configuration: T,
): T & {
  token_endpoint: string;
  introspection_endpoint: string;
  revocation_endpoint: string;
  mcp_session_endpoint: string;
  mcp_handshake_endpoint: string;
  mcp_scopes_supported: string[];
  mcp_servers_metadata: string;
} => {
  const sanitizeEndpoint = (value: unknown, fallback: string, legacyPath?: string): string => {
    if (typeof value === "string" && value.length > 0) {
      if (legacyPath && value.includes(legacyPath)) {
        return fallback;
      }
      return value;
    }
    return fallback;
  };

  const tokenEndpoint = new URL("/api/auth/oauth2/token", baseURL).toString();
  const introspectionEndpoint = new URL("/api/auth/oauth2/introspect", baseURL).toString();
  const revocationEndpoint = new URL("/api/auth/oauth2/revoke", baseURL).toString();
  const sessionEndpoint = new URL("/api/auth/mcp/session", baseURL).toString();
  const handshakeEndpoint = new URL("/api/auth/mcp/handshake", baseURL).toString();
  const serversDocument = new URL("/.well-known/mcp-servers.json", baseURL).toString();

  const enriched = { ...(configuration as Record<string, unknown>) };
  enriched.token_endpoint = sanitizeEndpoint(enriched.token_endpoint, tokenEndpoint, "/api/auth/mcp/token");
  enriched.introspection_endpoint = sanitizeEndpoint(
    enriched.introspection_endpoint,
    introspectionEndpoint,
    "/api/auth/mcp/introspect",
  );
  enriched.revocation_endpoint = sanitizeEndpoint(
    enriched.revocation_endpoint,
    revocationEndpoint,
    "/api/auth/mcp/revoke",
  );
  enriched.mcp_session_endpoint = sessionEndpoint;
  enriched.mcp_handshake_endpoint = handshakeEndpoint;
  enriched.mcp_scopes_supported = registry.getScopeCatalog();
  enriched.mcp_servers_metadata = serversDocument;

  return enriched as T & {
    token_endpoint: string;
    introspection_endpoint: string;
    revocation_endpoint: string;
    mcp_session_endpoint: string;
    mcp_handshake_endpoint: string;
    mcp_scopes_supported: string[];
    mcp_servers_metadata: string;
  };
};
