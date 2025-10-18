import "dotenv/config";
import { betterAuth } from "better-auth";
import { jwt, mcp } from "better-auth/plugins";
import { oidcProvider } from "better-auth/plugins/oidc-provider";
import Database from "better-sqlite3";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { resolveAllowedOrigins } from "./config/origins";

const databasePath = path.resolve(process.cwd(), "better-auth.sqlite");
const driver = process.env.BETTER_AUTH_DB_DRIVER ?? "better-sqlite3";

if (driver !== "better-sqlite3" && driver !== "node") {
  throw new Error(
    `Unsupported BETTER_AUTH_DB_DRIVER value "${driver}". Use "better-sqlite3" or "node".`,
  );
}

const sqlite =
  driver === "node" ? new DatabaseSync(databasePath) : new Database(databasePath);

let databaseClosed = false;

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
  throw new Error(
    "Missing BETTER_AUTH_SECRET environment variable. Define one in your .env file.",
  );
}

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const loginPage = process.env.OIDC_LOGIN_PATH ?? "/login";
const consentPage = process.env.OIDC_CONSENT_PATH ?? "/consent";
const mcpResource = process.env.MCP_RESOURCE ?? baseURL;

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

const socialProviders =
  googleClientId && googleClientSecret
    ? {
        google: {
          clientId: googleClientId,
          clientSecret: googleClientSecret,
        },
      }
    : undefined;

if (!socialProviders) {
  console.warn(
    "Google OAuth credentials not set; the Google social provider remains disabled until " +
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are configured.",
  );
}

const allowedOrigins = resolveAllowedOrigins(baseURL);

let cookieDomain: string | undefined;
let cookieSecure = false;
let cookieSameSite: "none" | "lax" = "lax";

try {
  const url = new URL(baseURL);
  cookieSecure = url.protocol === "https:";
  cookieSameSite = cookieSecure ? "none" : "lax";
  if (cookieSecure) {
    cookieDomain = `.${url.hostname}`;
  }
} catch (error) {
  console.warn(`Invalid BETTER_AUTH_URL provided (${baseURL}). Falling back to HTTP defaults.`, error);
}

export const auth = betterAuth({
  database: sqlite,
  secret,
  baseURL,
  trustedOrigins: allowedOrigins,
  ...(socialProviders ? { socialProviders } : {}),
  plugins: [
    jwt(),
    oidcProvider({
      loginPage,
      consentPage,
      allowDynamicClientRegistration: true,
      useJWTPlugin: true,
    }),
    mcp({
      loginPage,
      resource: mcpResource,
    }),
  ],
  advanced: {
    useSecureCookies: cookieSecure,
    cookieAttributes: {
      sameSite: cookieSameSite,
      secure: cookieSecure,
      httpOnly: true,
      domain: cookieDomain,
      path: "/",
    },
    crossSubDomainCookies: {
      enabled: Boolean(cookieDomain),
      domain: cookieDomain,
    },
  },
});

export const closeAuth = () => {
  if (databaseClosed) {
    return;
  }

  sqlite.close();
  databaseClosed = true;
};
