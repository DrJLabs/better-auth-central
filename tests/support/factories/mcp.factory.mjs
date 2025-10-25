import { randomUUID } from 'node:crypto';

const DEFAULT_ORIGIN = 'https://todo.example.com';
const DEFAULT_RESOURCE = 'https://todo.example.com/api';

export function createMcpClient(overrides = {}) {
  const id = overrides.id ?? `client-${randomUUID()}`;
  const origin = overrides.origin ?? DEFAULT_ORIGIN;
  const resource = overrides.resource ?? DEFAULT_RESOURCE;
  const redirectUri =
    overrides.redirectUri ?? `${origin.replace(/\/$/, '')}/oauth/callback`;
  const scopes = overrides.scopes ?? ['tasks.read'];

  return {
    id,
    origin,
    resource,
    redirectUri,
    scopes,
    ...overrides,
  };
}

export function createTokenResponse(overrides = {}) {
  return {
    access_token: overrides.access_token ?? `access-${randomUUID()}`,
    token_type: overrides.token_type ?? 'Bearer',
    expires_in: overrides.expires_in ?? 300,
    scope: overrides.scope,
    // intentionally omit client_id/resource so tests fail until implementation fills them
    ...overrides,
  };
}

export function createIntrospectionResponse(overrides = {}) {
  return {
    active: overrides.active ?? true,
    scope: overrides.scope ?? 'tasks.read',
    client_id: overrides.client_id,
    resource: overrides.resource,
    issued_token_type: overrides.issued_token_type,
    ...overrides,
  };
}

export function createSessionPayload(overrides = {}) {
  return {
    userId: overrides.userId ?? `user-${randomUUID()}`,
    clientId: overrides.clientId ?? `client-${randomUUID()}`,
    scopes: overrides.scopes ?? ['tasks.read'],
    issuedAt: overrides.issuedAt,
    expiresAt: overrides.expiresAt,
    resource: overrides.resource,
    ...overrides,
  };
}

export function createHandshakeMetadata(overrides = {}) {
  const issuer = overrides.issuer ?? 'https://auth.example.com';
  const authorizationEndpoint = overrides.authorization_endpoint ?? `${issuer}/oauth2/authorize`;
  const tokenEndpoint = overrides.token_endpoint ?? `${issuer}/oauth2/token`;
  const introspectionEndpoint = overrides.introspection_endpoint ?? `${issuer}/oauth2/introspect`;
  const revocationEndpoint = overrides.revocation_endpoint ?? `${issuer}/oauth2/revoke`;
  const consentEndpoint = overrides.consent_endpoint ?? `${issuer}/consent`;
  const discoveryEndpoint = overrides.discovery_endpoint ?? `${issuer}/.well-known/openid-configuration`;

  return {
    issuer,
    authorization_endpoint: authorizationEndpoint,
    token_endpoint: tokenEndpoint,
    introspection_endpoint: introspectionEndpoint,
    revocation_endpoint: revocationEndpoint,
    consent_endpoint: consentEndpoint,
    discovery_endpoint: discoveryEndpoint,
    jwks_uri: overrides.jwks_uri ?? `${issuer}/.well-known/jwks.json`,
    ...overrides,
  };
}
