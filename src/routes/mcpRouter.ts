import express from "express";
import type { Request, Response, NextFunction } from "express";
import type { MCPRegistry, MCPClient } from "../mcp/registry";
import { enrichOpenIdConfiguration } from "../mcp/metadataBuilder";
import { buildHandshakeResponse, buildSessionResponse } from "../mcp/responses";

interface AuthAdapter {
  api: {
    getMcpOAuthConfig: () => Promise<unknown>;
    getMcpSession: (options: { headers: Record<string, string> }) => Promise<unknown>;
  };
}

export interface McpRouterOptions {
  auth: AuthAdapter;
  baseUrl: string;
  refreshRegistry: () => MCPRegistry;
  syncAllowedOrigins: () => void;
}

const logStructured = (
  level: "warn" | "info",
  event: string,
  details: Record<string, unknown>,
) => {
  const payload = JSON.stringify({ event, ...details });
  if (level === "warn") {
    console.warn(payload);
  } else {
    console.info(payload);
  }
};

const headerBagFromRequest = (req: Request): Record<string, string> => {
  const bag: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) {
      continue;
    }
    bag[key] = Array.isArray(value) ? value.join(", ") : value;
  }
  return bag;
};

const resolveClient = (registry: MCPRegistry, clientId?: string | null): MCPClient | undefined => {
  if (!clientId) {
    return undefined;
  }
  return registry.getById(clientId) ?? undefined;
};

const parseScopeList = (value: unknown): string[] | undefined => {
  if (Array.isArray(value)) {
    const normalized = value.filter((item): item is string => typeof item === "string" && item.length > 0);
    return normalized.length > 0 ? normalized : undefined;
  }
  if (typeof value === "string") {
    const scopes = value
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    return scopes.length > 0 ? scopes : undefined;
  }
  return undefined;
};

const toIsoString = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return undefined;
};

const normalizeSession = (
  raw: unknown,
  client: MCPClient | undefined,
): {
  userId?: string;
  clientId?: string;
  resource?: string;
  scopes?: string[];
  issuedAt?: string;
  expiresAt?: string;
} | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const clientId = typeof record.clientId === "string" ? record.clientId : client?.id;
  const resource = typeof record.resource === "string" ? record.resource : client?.resource;
  const scopes = parseScopeList(record.scopes) ?? client?.scopes;

  return {
    userId: typeof record.userId === "string" ? record.userId : undefined,
    clientId,
    resource,
    scopes,
    issuedAt: toIsoString(record.createdAt),
    expiresAt: toIsoString(record.accessTokenExpiresAt),
  };
};

export const createMcpRouter = (options: McpRouterOptions) => {
  const router = express.Router();

  router.get("/handshake", async (req: Request, res: Response, next: NextFunction) => {
    try {
      options.syncAllowedOrigins();
      const registry = options.refreshRegistry();

      const clientIdParam = typeof req.query.client_id === "string" ? req.query.client_id : undefined;
      const originParam = typeof req.query.origin === "string" ? req.query.origin : undefined;
      const candidateOrigin = req.get("Origin") ?? originParam;

      let normalizedOrigin: string | undefined;
      if (candidateOrigin) {
        try {
          normalizedOrigin = new URL(candidateOrigin).origin;
        } catch {
          logStructured("warn", "mcp_handshake_invalid_origin", {
            value: candidateOrigin,
            path: req.originalUrl,
          });
          res.status(400).json({ error: "invalid_origin", value: candidateOrigin });
          return;
        }
      }

      let client = clientIdParam ? registry.getById(clientIdParam) : undefined;
      if (!client && normalizedOrigin) {
        client = registry.getByOrigin(normalizedOrigin);
      }

      if (!client) {
        logStructured("warn", "mcp_handshake_unknown_client", {
          clientId: clientIdParam ?? "",
          origin: normalizedOrigin ?? "",
        });
        res.status(404).json({ error: "client_not_registered" });
        return;
      }

      if (normalizedOrigin && normalizedOrigin !== client.origin) {
        logStructured("warn", "mcp_handshake_origin_mismatch", {
          clientId: client.id,
          expected: client.origin,
          received: normalizedOrigin,
        });
        res.status(403).json({
          error: "origin_mismatch",
          expected: client.origin,
          received: normalizedOrigin,
        });
        return;
      }

      const oauthConfigRaw = await options.auth.api.getMcpOAuthConfig();
      const oauthConfig =
        oauthConfigRaw && typeof oauthConfigRaw === "object"
          ? (oauthConfigRaw as Record<string, unknown>)
          : {};
      const enriched = enrichOpenIdConfiguration(options.baseUrl, registry, oauthConfig);
      const responseBody = buildHandshakeResponse({ client, metadata: enriched, baseUrl: options.baseUrl });

      res
        .status(200)
        .set("Content-Type", "application/json")
        .set("Cache-Control", "no-store")
        .json(responseBody);
    } catch (error) {
      next(error);
    }
  });

  router.get("/session", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const challenge = `Bearer resource_metadata="${new URL(
        "/.well-known/oauth-protected-resource",
        options.baseUrl,
      ).toString()}"`;
      const authorization = req.get("Authorization");

      if (!authorization) {
        res
          .status(401)
          .set("WWW-Authenticate", challenge)
          .set("Access-Control-Expose-Headers", "WWW-Authenticate")
          .json({ error: "missing_authorization" });
        return;
      }

      const sessionRaw = await options.auth.api.getMcpSession({ headers: headerBagFromRequest(req) });
      if (!sessionRaw) {
        logStructured("warn", "mcp_session_invalid_token", { authorization: "redacted" });
        res
          .status(401)
          .set("WWW-Authenticate", challenge)
          .set("Access-Control-Expose-Headers", "WWW-Authenticate")
          .json({ error: "invalid_token" });
        return;
      }

      const registry = options.refreshRegistry();
      const rawClientId =
        sessionRaw && typeof sessionRaw === "object" && typeof (sessionRaw as Record<string, unknown>).clientId === "string"
          ? ((sessionRaw as Record<string, unknown>).clientId as string)
          : undefined;
      const client = resolveClient(registry, rawClientId);
      if (!client) {
        logStructured("warn", "mcp_session_unknown_client", { clientId: rawClientId ?? "" });
        res
          .status(404)
          .set("WWW-Authenticate", challenge)
          .set("Access-Control-Expose-Headers", "WWW-Authenticate")
          .json({ error: "client_not_registered" });
        return;
      }

      const normalized = normalizeSession(sessionRaw, client);
      if (!normalized) {
        throw new Error("Unable to normalize MCP session payload");
      }

      try {
        const responseBody = buildSessionResponse({ session: normalized, client });
        res
          .status(200)
          .set("Content-Type", "application/json")
          .set("Cache-Control", "no-store")
          .json(responseBody);
      } catch (error) {
        next(error);
      }
    } catch (error) {
      next(error);
    }
  });

  return router;
};
