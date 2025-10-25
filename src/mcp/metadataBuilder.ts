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
  mcp_session_endpoint: string;
  mcp_handshake_endpoint: string;
  mcp_scopes_supported: string[];
  mcp_servers_metadata: string;
} => {
  const sessionEndpoint = new URL("/api/auth/mcp/session", baseURL).toString();
  const handshakeEndpoint = new URL("/api/auth/mcp/handshake", baseURL).toString();
  const serversDocument = new URL("/.well-known/mcp-servers.json", baseURL).toString();

  return {
    ...configuration,
    mcp_session_endpoint: sessionEndpoint,
    mcp_handshake_endpoint: handshakeEndpoint,
    mcp_scopes_supported: registry.getScopeCatalog(),
    mcp_servers_metadata: serversDocument,
  };
};
