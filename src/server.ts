import express, { type Application, type NextFunction, type Request, type Response } from "express";
import cors, { type CorsOptions } from "cors";
import { toNodeHandler } from "better-auth/node";
import type { Server } from "node:http";
import { resolveAllowedOrigins } from "./config/origins";
import { renderConsentPage } from "./ui/consentPage";
import { renderLoginPage } from "./ui/loginPage";
import { auth, closeAuth } from "./auth";

type AuthLike = typeof auth;

export interface CreateAppOptions {
  authInstance?: AuthLike;
  loginPath?: string;
  consentPath?: string;
}

const buildParams = (query: Request["query"]): URLSearchParams => {
  const params = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(query)) {
    if (rawValue == null) {
      continue;
    }

    if (Array.isArray(rawValue)) {
      for (const value of rawValue) {
        if (value != null) {
          params.append(key, String(value));
        }
      }
      continue;
    }

    params.append(key, String(rawValue));
  }

  return params;
};

export const createApp = (options: CreateAppOptions = {}): Application => {
  const app = express();
  // behind Traefik/HTTPS; trust X-Forwarded-* so secure cookies & redirects work
  app.set("trust proxy", 1);

  const allowedOrigins = resolveAllowedOrigins();
  const allowedOriginSet = new Set(allowedOrigins);

  const corsOptions: CorsOptions = {
    origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
      if (!origin || allowedOriginSet.has(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Set-Cookie"],
    preflightContinue: false,
  };

  const corsMiddleware = cors(corsOptions);
  app.use(corsMiddleware);

  app.use((req: Request, res: Response, next: NextFunction) => {
    const originHeader = req.headers.origin;
    const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;

    if (origin && !allowedOriginSet.has(origin)) {
      console.warn(`Rejecting request from disallowed origin: ${origin}`);
      res.status(403).json({ error: "origin_not_allowed" });
      return;
    }

    next();
  });

  const authInstance = options.authInstance ?? auth;
  const authApi = authInstance.api;
  const loginPath = options.loginPath ?? process.env.OIDC_LOGIN_PATH ?? "/login";
  const consentPath = options.consentPath ?? process.env.OIDC_CONSENT_PATH ?? "/consent";
  const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const googleProviderConfigured = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );

  const authHandler = toNodeHandler(authInstance);

  const handleAuth = (req: Request, res: Response, next: NextFunction) => {
    req.url = req.originalUrl;
    authHandler(req, res).catch(next);
  };

  app.use("/api/auth", handleAuth);

  app.get("/.well-known/oauth-authorization-server", async (_req, res, next) => {
    try {
      const metadata = await authApi.getMcpOAuthConfig();
      res.json(metadata);
    } catch (error) {
      next(error);
    }
  });

  app.get("/.well-known/oauth-protected-resource", async (_req, res, next) => {
    try {
      const metadata = await authApi.getMCPProtectedResource();
      res.json(metadata);
    } catch (error) {
      next(error);
    }
  });

  app.get(loginPath, (_req, res) => {
    res
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
    const params = buildParams(req.query);

    const consentCode = params.get("consent_code") ?? "";
    const clientId = params.get("client_id") ?? "";
    const scope = params.get("scope") ?? "";

    const scopeList = scope
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    res
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
