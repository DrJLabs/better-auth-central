import "dotenv/config";
import { betterAuth } from "better-auth";
import { jwt, mcp } from "better-auth/plugins";
import { oidcProvider } from "better-auth/plugins/oidc-provider";
import Database from "better-sqlite3";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { getDomain } from "tldts";
import { resolveAllowedOrigins } from "./config/origins";
import { loadMcpConfig } from "./config/mcp";
import { initializeMcpRegistry, reloadMcpRegistry } from "./mcp/registry";

const parseBooleanEnv = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  console.warn(
    `Unrecognised boolean value "${value}" for OIDC_DYNAMIC_REGISTRATION. Falling back to ${defaultValue}.`,
  );
  return defaultValue;
};

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
const mcpConfig = loadMcpConfig(baseURL, allowedOrigins);
let currentMcpConfig = mcpConfig;
const mcpRegistry = initializeMcpRegistry(mcpConfig);
const allowDynamicClientRegistration = parseBooleanEnv(
  process.env.OIDC_DYNAMIC_REGISTRATION,
  false,
);

const explicitCookieDomainValue = process.env.BETTER_AUTH_COOKIE_DOMAIN?.trim();
const explicitCookieDomain = explicitCookieDomainValue
  ? explicitCookieDomainValue.startsWith(".")
    ? explicitCookieDomainValue
    : `.${explicitCookieDomainValue}`
  : undefined;

let cookieDomain: string | undefined = explicitCookieDomain;
let cookieSecure = false;
let cookieSameSite: "none" | "lax" = "lax";

try {
  const url = new URL(baseURL);
  cookieSecure = url.protocol === "https:";
  cookieSameSite = cookieSecure ? "none" : "lax";

  if (cookieSecure) {
    if (!cookieDomain) {
      const registrableDomain = getDomain(url.hostname, { allowPrivateDomains: true });
      if (registrableDomain) {
        cookieDomain = `.${registrableDomain}`;
      }
    }
  } else if (cookieDomain) {
    console.warn(
      "BETTER_AUTH_COOKIE_DOMAIN is set but BETTER_AUTH_URL is not HTTPS; cross-subdomain cookies remain disabled.",
    );
    cookieDomain = undefined;
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
      allowDynamicClientRegistration,
      useJWTPlugin: true,
    }),
    mcp({
      loginPage,
      resource: mcpResource,
      oidcConfig: {
        loginPage,
        consentPage,
        scopes: mcpRegistry.getScopeCatalog(),
      },
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

export { getMcpRegistry } from "./mcp/registry";

export const getMcpConfig = () => currentMcpConfig;

export const refreshMcpRegistry = () => {
  const latestAllowedOrigins = resolveAllowedOrigins(baseURL);
  const updatedConfig = loadMcpConfig(baseURL, latestAllowedOrigins);
  currentMcpConfig = updatedConfig;
  return reloadMcpRegistry(updatedConfig);
};
