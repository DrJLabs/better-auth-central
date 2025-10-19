import express, {
  type Application,
  type NextFunction,
  type Request as ExpressRequest,
  type RequestHandler,
  type Response as ExpressResponse,
} from "express";
import cors, { type CorsOptions } from "cors";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { oAuthDiscoveryMetadata, oAuthProtectedResourceMetadata } from "better-auth/plugins";
import type { Server } from "node:http";
import { resolveAllowedOrigins } from "./config/origins";
import { renderConsentPage } from "./ui/consentPage";
import { renderLoginPage } from "./ui/loginPage";
import { auth, closeAuth } from "./auth";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

const FORWARDED_HEADER_BLOCKLIST = new Set([
  "access-control-allow-origin",
  "access-control-allow-credentials",
  "access-control-allow-methods",
  "access-control-allow-headers",
  "access-control-max-age",
]);

type AuthLike = typeof auth;

export interface CreateAppOptions {
  authInstance?: AuthLike;
  loginPath?: string;
  consentPath?: string;
}

const sendFetchResponse = async (
  fetchResponse: globalThis.Response,
  res: ExpressResponse,
): Promise<void> => {
  res.status(fetchResponse.status);

  fetchResponse.headers.forEach((value, key) => {
    if (FORWARDED_HEADER_BLOCKLIST.has(key.toLowerCase())) {
      return;
    }
    res.append(key, value);
  });

  const body = fetchResponse.body;
  if (!body) {
    const payload = await fetchResponse.text();
    if (payload.length > 0) {
      res.send(payload);
      return;
    }

    res.end();
    return;
  }

  // The Fetch API returns the DOM `ReadableStream`, while Node's helper expects the
  // `node:stream/web` flavour. The cast links the two since they are compatible at runtime.
  const nodeStream = Readable.fromWeb(body as unknown as NodeReadableStream);

  try {
    await pipeline(nodeStream, res);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === "ERR_STREAM_PREMATURE_CLOSE") {
      return;
    }
    throw error;
  }
};

const createFetchRequest = (req: ExpressRequest, baseUrl: string): globalThis.Request => {
  const url = new URL(req.originalUrl, baseUrl);
  const headers = fromNodeHeaders(req.headers);

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const requestInit: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
  };

  if (hasBody) {
    // Node's `Request` constructor accepts Readable streams, but `BodyInit` does not capture
    // that, so we cast the Express request stream before handing it off.
    requestInit.body = req as unknown as BodyInit;
    requestInit.duplex = "half";
  }

  return new Request(url, requestInit);
};

const adaptFetchHandler =
  (
    handler: (request: globalThis.Request) => Promise<globalThis.Response>,
    baseUrl: string,
  ): RequestHandler =>
  async (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
    try {
      const fetchResponse = await handler(createFetchRequest(req, baseUrl));
      await sendFetchResponse(fetchResponse, res);
    } catch (error) {
      next(error);
    }
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

  app.use("/api/auth", handleAuth);

  const discoveryHandler = adaptFetchHandler(oAuthDiscoveryMetadata(authInstance), baseURL);
  const protectedResourceHandler = adaptFetchHandler(
    oAuthProtectedResourceMetadata(authInstance),
    baseURL,
  );

  app.get("/.well-known/oauth-authorization-server", discoveryHandler);

  app.get("/.well-known/oauth-protected-resource", protectedResourceHandler);

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
