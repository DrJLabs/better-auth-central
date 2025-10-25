import express, {
  type Application,
  type NextFunction,
  type Request as ExpressRequest,
  type RequestHandler,
  type Response as ExpressResponse,
} from "express";
import cors, { type CorsOptions } from "cors";
import { toNodeHandler } from "better-auth/node";
import { oAuthProtectedResourceMetadata } from "better-auth/plugins";
import type { Server } from "node:http";
import { resolveAllowedOrigins } from "./config/origins";
import { renderConsentPage } from "./ui/consentPage";
import { renderLoginPage } from "./ui/loginPage";
import { auth, closeAuth, getMcpConfig, getMcpRegistry, refreshMcpRegistry } from "./auth";
import { buildMcpServersDocument, enrichOpenIdConfiguration } from "./mcp/metadataBuilder";
import { adaptFetchHandler } from "./routes/httpUtils";
import { createOAuthRouter } from "./routes/oauthRouter";
import { createMcpRouter } from "./routes/mcpRouter";

type AuthLike = typeof auth;

export interface CreateAppOptions {
  authInstance?: AuthLike;
  loginPath?: string;
  consentPath?: string;
}

export const createApp = (options: CreateAppOptions = {}): Application => {
  const app = express();
  // behind Traefik/HTTPS; trust X-Forwarded-* so secure cookies & redirects work
  app.set("trust proxy", 1);

  const allowedOrigins = resolveAllowedOrigins();
  const allowedOriginSet = new Set(allowedOrigins);

  const syncAllowedOrigins = () => {
    const latestOrigins = resolveAllowedOrigins();
    allowedOriginSet.clear();
    for (const origin of latestOrigins) {
      allowedOriginSet.add(origin);
    }
  };

  const corsOptions: CorsOptions = {
    origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
      if (!origin || allowedOriginSet.has(origin)) {
        callback(null, true);
        return;
      }

      const error = new Error("origin_not_allowed");
      callback(error);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Set-Cookie"],
    preflightContinue: false,
  };

  const corsMiddleware = cors(corsOptions);
  app.use(corsMiddleware);

  app.use((error: unknown, _req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
    if (error instanceof Error && error.message === "origin_not_allowed") {
      res.status(403).json({ error: "origin_not_allowed" });
      return;
    }

    next(error as Error);
  });

  const authInstance = options.authInstance ?? auth;
  const loginPath = options.loginPath ?? process.env.OIDC_LOGIN_PATH ?? "/login";
  const consentPath = options.consentPath ?? process.env.OIDC_CONSENT_PATH ?? "/consent";
  const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const googleProviderConfigured = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );

  const authHandler = toNodeHandler(authInstance);

  const handleAuth: RequestHandler = (req, res, next) => {
    req.url = req.originalUrl;
    authHandler(req, res).catch(next);
  };

  const protectedResourceHandler = adaptFetchHandler(
    oAuthProtectedResourceMetadata(authInstance),
    baseURL,
  );

  const oauthRouter = createOAuthRouter({
    auth: authInstance,
    baseUrl: baseURL,
    getRegistry: () => getMcpRegistry(),
    getConfig: () => getMcpConfig(),
  });

  const mcpRouter = createMcpRouter({
    auth: authInstance,
    baseUrl: baseURL,
    refreshRegistry: () => refreshMcpRegistry(),
    syncAllowedOrigins,
  });

  app.use("/api/auth/mcp", mcpRouter);
  app.get("/.well-known/oauth-authorization-server", async (_req, res, next) => {
    try {
      const registry = refreshMcpRegistry();
      syncAllowedOrigins();
      const oauthConfig = (await authInstance.api.getMcpOAuthConfig()) ?? {};
      const enriched = enrichOpenIdConfiguration(
        baseURL,
        registry,
        oauthConfig as Record<string, unknown>,
      );
      res
        .status(200)
        .set("Content-Type", "application/json")
        .set("Cache-Control", "no-store")
        .json(enriched);
    } catch (error) {
      next(error);
    }
  });

  app.get("/.well-known/mcp-servers.json", (_req, res, next) => {
    try {
      const registry = refreshMcpRegistry();
      syncAllowedOrigins();
      const document = buildMcpServersDocument(baseURL, registry.list());
      res
        .status(200)
        .set("Content-Type", "application/json")
        .set("Cache-Control", "no-store")
        .json(document);
    } catch (error) {
      next(error);
    }
  });

  app.get("/.well-known/oauth-protected-resource", protectedResourceHandler);
  app.use("/api/auth", oauthRouter);
  app.use("/api/auth", handleAuth);

  app.get(loginPath, (_req, res) => {
    res
      .set("X-Frame-Options", "DENY")
      .set(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
      )
      .type("html")
      .send(
        renderLoginPage({
          googleSignInUrl: "/api/auth/sign-in/social?provider=google",
          baseUrl: baseURL,
          googleProviderConfigured,
        }),
      );
  });

  app.get(consentPath, (req, res) => {
    const params = new URL(req.originalUrl, baseURL).searchParams;

    const consentCode = params.get("consent_code") ?? "";
    const clientId = params.get("client_id") ?? "";
    const scope = params.get("scope") ?? "";

    const scopeList = scope
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    res
      .set("X-Frame-Options", "DENY")
      .set(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
      )
      .type("html")
      .send(
        renderConsentPage({
          consentCode,
          clientId,
          scopeList,
          submitUrl: "/api/auth/oauth2/consent",
        }),
      );
  });

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  return app;
};

type StartedServer = Server & { shutdown: (signal?: NodeJS.Signals) => void };

export const startServer = (): StartedServer => {
  const app = createApp();
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  const server = app.listen(port, () => {
    console.log(`Better Auth server listening on http://localhost:${port}`);
  });

  let shuttingDown = false;
  let authClosed = false;

  const closeAuthResources = () => {
    if (authClosed) {
      return;
    }

    try {
      closeAuth();
      authClosed = true;
    } catch (error) {
      console.error("Error closing Better Auth resources", error);
      if (process.exitCode === undefined) {
        process.exitCode = 1;
      }
    }
  };

  const shutdown = (signal?: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    if (signal) {
      console.log(`Received ${signal}, shutting down gracefully...`);
    }

    server.close((error) => {
      if (error) {
        console.error("Error closing HTTP server", error);
        if (process.exitCode === undefined) {
          process.exitCode = 1;
        }
      }

      closeAuthResources();

      if (signal) {
        process.exit();
      }
    });
  };

  server.on("close", closeAuthResources);

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => shutdown(signal));
  }

  return Object.assign(server as StartedServer, { shutdown });
};

if (require.main === module) {
  startServer();
}
