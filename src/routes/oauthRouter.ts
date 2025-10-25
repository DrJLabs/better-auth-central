import express from "express";
import type { Request, Response, NextFunction } from "express";
import type { MCPRegistry, MCPClient } from "../mcp/registry";
import { buildIntrospectionResponse, buildTokenResponse } from "../mcp/responses";
import { createFetchRequest, readRequestBody, sendFetchResponse } from "./httpUtils";

interface AuthAdapter {
  handler(request: globalThis.Request): Promise<globalThis.Response>;
  api: {
    getMcpSession(options: { headers: Record<string, string> }): Promise<unknown>;
  };
}

export interface OAuthRouterOptions {
  auth: AuthAdapter;
  baseUrl: string;
  refreshRegistry: () => MCPRegistry;
  getConfig: () => { defaultScopes: string[]; enforceScopeAlignment: boolean };
}

const parseScopeList = (value: string | null | undefined): string[] => {
  if (!value) {
    return [];
  }
  return value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const normalizeSession = (
  value: unknown,
): {
  clientId?: string;
  resource?: string;
  scopes?: string[];
} | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const scopesValue = record.scopes;
  let scopes: string[] | undefined;

  if (Array.isArray(scopesValue)) {
    scopes = scopesValue.filter((item): item is string => typeof item === "string" && item.length > 0);
  } else if (typeof scopesValue === "string") {
    scopes = parseScopeList(scopesValue);
  }

  return {
    clientId: typeof record.clientId === "string" ? record.clientId : undefined,
    resource: typeof record.resource === "string" ? record.resource : undefined,
    scopes,
  };
};

class ScopeMismatchError extends Error {
  constructor(
    public readonly client: MCPClient,
    public readonly requested: string[],
    public readonly rejected: string[],
  ) {
    super("scope_mismatch");
  }
}

const negotiateScopes = (
  client: MCPClient,
  requestedScopes: string[],
  enforceAlignment: boolean,
): { scopes: string[]; rejected: string[] } => {
  if (requestedScopes.length === 0) {
    return { scopes: client.scopes, rejected: [] };
  }

  const allowed = new Set(client.scopes);
  const rejected = requestedScopes.filter((scope) => !allowed.has(scope));

  if (rejected.length > 0) {
    if (enforceAlignment) {
      throw new ScopeMismatchError(client, requestedScopes, rejected);
    }
    const intersection = requestedScopes.filter((scope) => allowed.has(scope));
    return {
      scopes: intersection.length > 0 ? intersection : client.scopes,
      rejected,
    };
  }

  return { scopes: requestedScopes, rejected: [] };
};

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

const bodyToForm = async (req: Request): Promise<{ body: string; form: URLSearchParams }> => {
  const buffer = await readRequestBody(req);
  const body = buffer.toString("utf-8");
  const form = new URLSearchParams(body);
  return { body, form };
};

export const createOAuthRouter = (options: OAuthRouterOptions) => {
  const router = express.Router();

  router.post("/oauth2/token", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { form } = await bodyToForm(req);
      const registry = options.refreshRegistry();
      const clientIdParam = form.get("client_id") ?? undefined;
      const client = clientIdParam ? registry.getById(clientIdParam) : undefined;

      if (!client) {
        logStructured("warn", "mcp_token_unknown_client", { clientId: clientIdParam ?? "", path: req.originalUrl });
        res.status(400).json({ error: "client_not_registered" });
        return;
      }

      const config = options.getConfig();
      const requestedScopes = parseScopeList(form.get("scope"));
      let negotiation: { scopes: string[]; rejected: string[] };
      try {
        negotiation = negotiateScopes(client, requestedScopes, config.enforceScopeAlignment);
      } catch (error) {
        if (error instanceof ScopeMismatchError) {
          logStructured("warn", "mcp_scope_mismatch", {
            clientId: client.id,
            requested: requestedScopes,
            rejected: error.rejected,
            enforceAlignment: config.enforceScopeAlignment,
          });
          res.status(403).json({
            error: "scope_mismatch",
            clientId: client.id,
            allowed: client.scopes,
            requested: requestedScopes,
          });
          return;
        }
        throw error;
      }

      if (negotiation.rejected.length > 0) {
        logStructured("warn", "mcp_scope_mismatch", {
          clientId: client.id,
          requested: requestedScopes,
          rejected: negotiation.rejected,
          enforceAlignment: config.enforceScopeAlignment,
        });

        if (config.enforceScopeAlignment) {
          res.status(403).json({
            error: "scope_mismatch",
            clientId: client.id,
            allowed: client.scopes,
            requested: requestedScopes,
          });
          return;
        }
      }

      const sanitizedScopes = negotiation.scopes;
      if (sanitizedScopes.length > 0) {
        form.set("scope", sanitizedScopes.join(" "));
      } else {
        form.delete("scope");
      }

      const upstreamBody = form.toString();
      const upstreamRequest = createFetchRequest(req, options.baseUrl, { body: upstreamBody });
      const upstreamResponse = await options.auth.handler(upstreamRequest);

      if (!upstreamResponse.ok) {
        await sendFetchResponse(upstreamResponse, res);
        return;
      }

      const upstreamPayload = await upstreamResponse.json();
      const normalized = buildTokenResponse({
        payload: upstreamPayload,
        client,
        resolvedScopes: negotiation.scopes,
        defaultScopes: config.defaultScopes,
      });

      res
        .status(200)
        .set("Content-Type", "application/json")
        .set("Cache-Control", "no-store")
        .set("Pragma", "no-cache")
        .json(normalized);
    } catch (error) {
      next(error);
    }
  });

  router.post("/oauth2/introspect", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { body, form } = await bodyToForm(req);
      const token = form.get("token") ?? undefined;

      const upstreamRequest = createFetchRequest(req, options.baseUrl, { body });
      const upstreamResponse = await options.auth.handler(upstreamRequest);

      if (!upstreamResponse.ok) {
        await sendFetchResponse(upstreamResponse, res);
        return;
      }

      const upstreamPayload = await upstreamResponse.json();
      const registry = options.refreshRegistry();

      let session = null;
      if (token) {
        const sessionRaw = await options.auth.api.getMcpSession({
          headers: { Authorization: `Bearer ${token}` },
        });
        session = normalizeSession(sessionRaw);
      }

      const client = session?.clientId ? registry.getById(session.clientId) : undefined;
      const config = options.getConfig();
      const normalized = buildIntrospectionResponse({
        payload: upstreamPayload,
        session,
        client,
        defaultScopes: config.defaultScopes,
      });

      res
        .status(200)
        .set("Content-Type", "application/json")
        .set("Cache-Control", "no-store")
        .set("Pragma", "no-cache")
        .json(normalized);
    } catch (error) {
      next(error);
    }
  });

  return router;
};
