import "dotenv/config";
import { betterAuth } from "better-auth";
import { jwt, mcp } from "better-auth/plugins";
import { oidcProvider } from "better-auth/plugins/oidc-provider";
import Database from "better-sqlite3";
import path from "node:path";

const databasePath = path.resolve(process.cwd(), "better-auth.sqlite");
const sqlite = new Database(databasePath);
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

export const auth = betterAuth({
  database: sqlite,
  secret,
  baseURL,
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
});

export const closeAuth = () => {
  if (databaseClosed) {
    return;
  }

  sqlite.close();
  databaseClosed = true;
};
