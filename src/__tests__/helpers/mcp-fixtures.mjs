import { randomUUID } from 'node:crypto';

const TEN_MINUTES_IN_MS = 10 * 60 * 1000;

export function createRegistryClient(overrides = {}) {
  const origin = overrides.origin ?? 'https://example.mcp.client';
  const defaults = {
    id: `client-${randomUUID()}`,
    origin,
    resource: `${origin}/api`,
    redirectUri: `${origin}/oauth/callback`,
    scopes: ['tasks.read'],
  };

  return {
    ...defaults,
    ...overrides,
  };
}

export function createMcpSession({
  token,
  userId,
  registryClient,
  overrides = {},
} = {}) {
  const now = Date.now();
  const defaultIssuedAt = new Date(now).toISOString();
  const defaultExpiresAt = new Date(now + TEN_MINUTES_IN_MS).toISOString();

  const sessionDefaults = {
    userId: userId ?? overrides.userId ?? `user-${randomUUID()}`,
    clientId: overrides.clientId ?? registryClient?.id ?? `client-${randomUUID()}`,
    scopes: overrides.scopes ?? registryClient?.scopes ?? ['tasks.read'],
    resource: overrides.resource ?? registryClient?.resource ?? '',
    issuedAt: overrides.issuedAt ?? defaultIssuedAt,
    expiresAt: overrides.expiresAt ?? defaultExpiresAt,
  };

  const session = {
    ...sessionDefaults,
    ...overrides,
  };

  return {
    token: token ?? overrides.token ?? `session-${randomUUID()}`,
    session,
  };
}

export async function buildMcpTestHarness({
  registryClient = createRegistryClient(),
  sessions = [],
  environment = {},
} = {}) {
  const previousEnv = new Map();
  const mutatedKeys = new Set();

  const setEnv = (key, value) => {
    if (!previousEnv.has(key)) {
      previousEnv.set(key, process.env[key]);
    }

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }

    mutatedKeys.add(key);
  };

  const trustedOrigins = new Set(
    (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  trustedOrigins.add(registryClient.origin);

  setEnv('BETTER_AUTH_DB_DRIVER', environment.BETTER_AUTH_DB_DRIVER ?? 'node');
  if (!process.env.BETTER_AUTH_SECRET) {
    setEnv('BETTER_AUTH_SECRET', 'test-secret');
  }
  setEnv('BETTER_AUTH_URL', environment.BETTER_AUTH_URL ?? 'https://auth.example.com');
  setEnv('BETTER_AUTH_TRUSTED_ORIGINS', Array.from(trustedOrigins).join(','));
  setEnv('OIDC_DYNAMIC_REGISTRATION', environment.OIDC_DYNAMIC_REGISTRATION ?? 'false');
  setEnv('MCP_CLIENTS', JSON.stringify([registryClient]));
  setEnv(
    'MCP_DEFAULT_SCOPES',
    environment.MCP_DEFAULT_SCOPES ?? (registryClient.scopes ?? ['tasks.read']).join(' '),
  );
  setEnv(
    'MCP_ENFORCE_SCOPE_ALIGNMENT',
    String(environment.MCP_ENFORCE_SCOPE_ALIGNMENT ?? 'true'),
  );

  const sessionStore = new Map();
  sessions.forEach(({ token, session }) => {
    sessionStore.set(token, session);
  });

  const authStub = {
    handler: async (request) => {
      const url = new URL(request.url);

      if (url.pathname.endsWith('/oauth2/token')) {
        const body = await request.text();
        sessionStore.set('last-token-body', body);
        return new Response(
          JSON.stringify({
            access_token: 'access-token-123',
            token_type: 'Bearer',
            expires_in: 600,
            scope: registryClient.scopes?.join(' ') ?? 'tasks.read',
            client_id: registryClient.id,
            resource: registryClient.resource,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      if (url.pathname.endsWith('/oauth2/introspect')) {
        const body = await request.text();
        sessionStore.set('last-introspect-body', body);
        const params = new URLSearchParams(body);
        const token = params.get('token') ?? '';

        if (!sessionStore.has(token)) {
          return new Response(
            JSON.stringify({ active: false }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          );
        }

        return new Response(
          JSON.stringify({
            active: true,
            scope: registryClient.scopes?.join(' ') ?? 'tasks.read',
            client_id: registryClient.id,
            resource: registryClient.resource,
            issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      return new Response(
        JSON.stringify({ error: 'not_found', path: url.pathname }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    },
    api: {
      getMcpOAuthConfig: async () => ({
        issuer: process.env.BETTER_AUTH_URL,
        authorization_endpoint: `${process.env.BETTER_AUTH_URL}/api/auth/oauth2/authorize`,
        token_endpoint: `${process.env.BETTER_AUTH_URL}/api/auth/oauth2/token`,
        introspection_endpoint: `${process.env.BETTER_AUTH_URL}/api/auth/oauth2/introspect`,
        revocation_endpoint: `${process.env.BETTER_AUTH_URL}/api/auth/oauth2/revoke`,
        jwks_uri: `${process.env.BETTER_AUTH_URL}/.well-known/jwks.json`,
        consent_endpoint: `${process.env.BETTER_AUTH_URL}/consent`,
        discovery_endpoint: `${process.env.BETTER_AUTH_URL}/.well-known/openid-configuration`,
      }),
      getMcpSession: async ({ headers }) => {
        const authorization = headers.Authorization ?? headers.authorization ?? '';
        const token = authorization.replace('Bearer', '').trim();
        return sessionStore.get(token) ?? null;
      },
    },
  };

  const { createApp } = await import('../../../dist/server.js');
  const authModule = await import('../../../dist/auth.js');
  authModule.refreshMcpRegistry();
  const app = createApp({ authInstance: authStub });

  const restoreEnv = () => {
    for (const key of mutatedKeys) {
      const previousValue = previousEnv.get(key);
      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
    mutatedKeys.clear();
    previousEnv.clear();
  };

  return { app, sessionStore, registryClient, authStub, restoreEnv };
}
