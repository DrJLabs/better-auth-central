import supertest from 'supertest';
import { URL } from 'node:url';
import {
  createMcpClient,
  createTokenResponse,
  createIntrospectionResponse,
  createSessionPayload,
  createHandshakeMetadata,
} from '../factories/mcp.factory.mjs';

let serverModulePromise;

async function loadServerModule() {
  if (!serverModulePromise) {
    serverModulePromise = import('../../../dist/server.js');
  }

  return serverModulePromise;
}

function buildAuthStub({ tokenResponse, introspectionResponse, sessionPayload, metadata, registryClient }) {
  const calls = {
    token: [],
    introspection: [],
    session: [],
  };

  const authInstance = {
    handler: async (request) => {
      const url = new URL(request.url);
      const pathname = url.pathname;

      if (pathname.endsWith('/oauth2/token')) {
        const bodyText = await request.text();
        calls.token.push({ body: bodyText });
        return new Response(JSON.stringify(tokenResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (pathname.endsWith('/oauth2/introspect')) {
        const bodyText = await request.text();
        calls.introspection.push({ body: bodyText });
        return new Response(JSON.stringify(introspectionResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (pathname.endsWith('/oauth2/revoke')) {
        return new Response(null, { status: 200 });
      }

      return new Response(JSON.stringify({ error: 'not_found', path: url.pathname }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    api: {
      getMcpOAuthConfig: async () => metadata,
      getMCPProtectedResource: async () => ({
        resource: registryClient.resource,
        authorization_servers: [metadata.authorization_endpoint],
        jwks_uri: metadata.jwks_uri,
        scopes_supported: registryClient.scopes,
      }),
      getMcpSession: async () => {
        calls.session.push({});
        return sessionPayload;
      },
    },
  };

  return { authInstance, calls, registryClient, metadata };
}

function applyTestEnvironment({ registryClient, metadata }) {
  const previousEnv = {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    BETTER_AUTH_TRUSTED_ORIGINS: process.env.BETTER_AUTH_TRUSTED_ORIGINS,
    MCP_CLIENTS: process.env.MCP_CLIENTS,
    MCP_DEFAULT_SCOPES: process.env.MCP_DEFAULT_SCOPES,
    MCP_ENFORCE_SCOPE_ALIGNMENT: process.env.MCP_ENFORCE_SCOPE_ALIGNMENT,
  };

  process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET ?? 'test-secret';
  process.env.BETTER_AUTH_URL = metadata.issuer ?? 'https://auth.example.com';

  const trustedOrigins = new Set(
    (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? '').split(',').filter((item) => item.length > 0),
  );
  trustedOrigins.add(registryClient.origin);
  process.env.BETTER_AUTH_TRUSTED_ORIGINS = Array.from(trustedOrigins).join(',');

  process.env.MCP_CLIENTS = JSON.stringify([registryClient]);
  process.env.MCP_DEFAULT_SCOPES = registryClient.scopes.join(' ');
  process.env.MCP_ENFORCE_SCOPE_ALIGNMENT = 'true';

  return () => {
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  };
}

export async function createAppFixture(options = {}) {
  const registryClient = createMcpClient(options.registryClient ?? {});
  const tokenResponse = createTokenResponse(options.tokenResponse ?? {});
  const introspectionResponse = createIntrospectionResponse(options.introspectionResponse ?? {});
  const sessionPayload = createSessionPayload({
    clientId: registryClient.id,
    resource: options.sessionPayload?.resource,
    ...options.sessionPayload,
  });
  const metadata = createHandshakeMetadata(options.metadata ?? {});

  const restoreEnv = applyTestEnvironment({ registryClient, metadata });
  const authStub = buildAuthStub({ tokenResponse, introspectionResponse, sessionPayload, metadata, registryClient });

  const serverModule = await loadServerModule();
  const createApp =
    serverModule.createApp ??
    serverModule.default?.createApp ??
    serverModule.default ??
    (() => {
      throw new Error('createApp export not found in server module');
    });

  const app = createApp({ authInstance: authStub.authInstance });
  const request = supertest(app);

  return {
    request,
    authStub,
    async close() {
      restoreEnv();
    },
  };
}
