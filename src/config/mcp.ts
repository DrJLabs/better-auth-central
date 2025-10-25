import { z } from "zod";

const parseJson = <T>(value: string | undefined, fallback: T, parser: (input: unknown) => T): T => {
  if (!value) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parser(parsed);
  } catch (error) {
    throw new Error(`Failed to parse MCP_CLIENTS. Ensure it is valid JSON. ${(error as Error).message}`);
  }
};

const booleanFromEnv = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }

  throw new Error(`Invalid boolean value "${value}". Expected true/false or 1/0.`);
};

const splitList = (value: string | undefined): string[] => {
  if (!value) {
    return [];
  }

  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const RawClientSchema = z.object({
  id: z.string().min(1, "Client id cannot be empty"),
  origin: z.string().url("Client origin must be an absolute URL"),
  scopes: z.array(z.string().min(1)).optional(),
  resource: z.string().url("resource must be an absolute URL"),
  redirectUri: z.string().url("redirectUri must be an absolute URL"),
});

type RawClient = z.infer<typeof RawClientSchema>;

const ClientsSchema = z.array(RawClientSchema);

export type MCPClient = RawClient & { scopes: string[] };

export interface MCPConfig {
  clients: MCPClient[];
  defaultScopes: string[];
  enforceScopeAlignment: boolean;
}

export const loadMcpConfig = (baseURL: string, allowedOrigins: string[]): MCPConfig => {
  const defaultScopes = splitList(process.env.MCP_DEFAULT_SCOPES) ?? [];
  const resolvedDefaultScopes = defaultScopes.length > 0 ? defaultScopes : ["openid"];

  const clients = parseJson(process.env.MCP_CLIENTS, [], (input) => ClientsSchema.parse(input));

  const enforceScopeAlignment = booleanFromEnv(
    process.env.MCP_ENFORCE_SCOPE_ALIGNMENT,
    true,
  );

  const validatedClients: MCPClient[] = clients.map((client: RawClient) => {
    const scopes = client.scopes ?? resolvedDefaultScopes;

    const origin = new URL(client.origin).origin;
    if (!allowedOrigins.includes(origin)) {
      throw new Error(
        `Client origin ${origin} is not present in trusted origins. ` +
          "Add it to BETTER_AUTH_TRUSTED_ORIGINS or BETTER_AUTH_URL.",
      );
    }

    return {
      ...client,
      origin,
      scopes,
      resource: client.resource,
    } satisfies MCPClient;
  });

  return {
    clients: validatedClients,
    defaultScopes: resolvedDefaultScopes,
    enforceScopeAlignment,
  } satisfies MCPConfig;
};

export const resolveScopeSet = (config: MCPConfig): Set<string> => {
  const scopeSet = new Set(config.defaultScopes);
  for (const client of config.clients) {
    for (const scope of client.scopes) {
      scopeSet.add(scope);
    }
  }
  return scopeSet;
};
