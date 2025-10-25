import { loadMcpConfig, type MCPClient, type MCPConfig } from "../config/mcp";

export type { MCPClient } from "../config/mcp";

export interface MCPRegistry {
  list(): MCPClient[];
  getById(id: string): MCPClient | undefined;
  getByOrigin(origin: string): MCPClient | undefined;
  refresh(config: MCPConfig): void;
  getScopeCatalog(): string[];
}

class InMemoryMcpRegistry implements MCPRegistry {
  #clientsById = new Map<string, MCPClient>();
  #clientsByOrigin = new Map<string, MCPClient>();
  #scopeCatalog = new Set<string>();

  constructor(private currentConfig: MCPConfig) {
    this.refresh(currentConfig);
  }

  list(): MCPClient[] {
    return Array.from(this.#clientsById.values());
  }

  getById(id: string): MCPClient | undefined {
    return this.#clientsById.get(id);
  }

  getByOrigin(origin: string): MCPClient | undefined {
    return this.#clientsByOrigin.get(origin);
  }

  refresh(config: MCPConfig): void {
    this.currentConfig = config;
    this.#clientsById.clear();
    this.#clientsByOrigin.clear();
    this.#scopeCatalog = new Set(config.defaultScopes);

    for (const client of config.clients) {
      this.#clientsById.set(client.id, client);
      this.#clientsByOrigin.set(client.origin, client);
      for (const scope of client.scopes) {
        this.#scopeCatalog.add(scope);
      }
    }
  }

  getScopeCatalog(): string[] {
    return Array.from(this.#scopeCatalog).sort();
  }
}

let registryInstance: MCPRegistry | null = null;

export const initializeMcpRegistry = (config: MCPConfig): MCPRegistry => {
  registryInstance = new InMemoryMcpRegistry(config);
  return registryInstance;
};

export const getMcpRegistry = (): MCPRegistry => {
  if (!registryInstance) {
    throw new Error("MCP registry has not been initialized yet.");
  }
  return registryInstance;
};

export const reloadMcpRegistry = (config: MCPConfig): MCPRegistry => {
  if (!registryInstance) {
    registryInstance = new InMemoryMcpRegistry(config);
    return registryInstance;
  }

  registryInstance.refresh(config);
  return registryInstance;
};

export const reloadMcpRegistryFromEnvironment = (options: {
  baseURL: string;
  allowedOrigins: string[];
}): MCPRegistry => {
  const config = loadMcpConfig(options.baseURL, options.allowedOrigins);
  return reloadMcpRegistry(config);
};
