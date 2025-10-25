import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAppFixture } from '../support/fixtures/app.fixture.mjs';

async function withFixture(testFn, options = {}) {
  const fixture = await createAppFixture(options);
  try {
    await testFn(fixture);
  } finally {
    await fixture.close();
  }
}

describe('MCP OAuth contract expectations (RED)', () => {
  it('token endpoint returns MCP-compliant payload', async () => {
    await withFixture(async ({ request, authStub }) => {
      const tokenRequest = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: authStub.registryClient.id,
        scope: authStub.registryClient.scopes.join(' '),
      }).toString();

      const response = await request
        .post('/api/auth/oauth2/token')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send(tokenRequest);

      assert.equal(response.status, 200, 'token endpoint should return HTTP 200');
      assert.equal(
        typeof response.body.access_token,
        'string',
        'access_token should be present as string',
      );
      assert.equal(response.body.token_type, 'Bearer', 'token_type should be Bearer');
      assert.equal(
        response.body.client_id,
        authStub.registryClient.id,
        'token response should include client_id matching requesting client',
      );
      assert.equal(
        response.body.resource,
        authStub.registryClient.resource,
        'token response should include resource identifier for MCP client',
      );
      assert.equal(
        response.body.scope,
        authStub.registryClient.scopes.join(' '),
        'token response should echo granted scopes as space-delimited string',
      );
      assert.equal(
        typeof response.body.expires_in,
        'number',
        'expires_in should be numeric seconds to expiry',
      );
    });
  });

  it('introspection response surface MCP metadata fields', async () => {
    await withFixture(async ({ request, authStub }) => {
      const response = await request
        .post('/api/auth/oauth2/introspect')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send(new URLSearchParams({ token: 'opaque-token' }).toString());

      assert.equal(response.status, 200, 'introspection endpoint should return HTTP 200');
      assert.equal(response.body.active, true, 'active flag should be true for valid token');
      assert.equal(
        response.body.client_id,
        authStub.registryClient.id,
        'introspection should return client_id for validated token',
      );
      assert.equal(
        response.body.resource,
        authStub.registryClient.resource,
        'introspection should return associated resource identifier',
      );
      assert.equal(
        response.body.issued_token_type,
        'urn:ietf:params:oauth:token-type:access_token',
        'introspection should declare issued_token_type per MCP schema',
      );
      assert.equal(
        response.body.scope,
        authStub.registryClient.scopes.join(' '),
        'introspection should surface granted scopes',
      );
    });
  });

  it('session endpoint returns MCP session contract fields', async () => {
    await withFixture(async ({ request, authStub }) => {
      const response = await request
        .get('/api/auth/mcp/session')
        .set('Authorization', 'Bearer test-session-token');

      assert.equal(response.status, 200, 'session endpoint should return HTTP 200');
      assert.equal(
        typeof response.body.userId,
        'string',
        'session payload should include userId string',
      );
      assert.equal(response.body.clientId, authStub.registryClient.id, 'clientId should match registry');
      assert.ok(Array.isArray(response.body.scopes), 'scopes should be returned as array');
      assert.equal(
        response.body.resource,
        authStub.registryClient.resource,
        'session payload should include resource identifier',
      );
      assert.match(
        response.body.issuedAt ?? '',
        /\d{4}-\d{2}-\d{2}T/,
        'issuedAt should be ISO-8601 timestamp string',
      );
      assert.match(
        response.body.expiresAt ?? '',
        /\d{4}-\d{2}-\d{2}T/,
        'expiresAt should be ISO-8601 timestamp string',
      );
    });
  });

  it('handshake response exposes consent and discovery endpoints alongside OAuth metadata', async () => {
    await withFixture(async ({ request, authStub }) => {
      const response = await request
        .get('/api/auth/mcp/handshake')
        .set('Origin', authStub.registryClient.origin)
        .query({ client_id: authStub.registryClient.id });

      assert.equal(response.status, 200, 'handshake should succeed for registered origin');
      assert.equal(response.body.clientId, authStub.registryClient.id);
      assert.equal(response.body.resource, authStub.registryClient.resource);
      assert.ok(response.body.metadata, 'handshake should include OAuth metadata snapshot');
      assert.equal(
        response.body.endpoints.authorization,
        response.body.metadata.authorization_endpoint,
        'authorization endpoint should be mapped from metadata',
      );
      assert.equal(
        response.body.endpoints.consent,
        response.body.metadata.consent_endpoint,
        'handshake should expose consent endpoint for MCP clients',
      );
      assert.equal(
        response.body.endpoints.discovery,
        response.body.metadata.discovery_endpoint,
        'handshake should expose discovery URL for client tooling',
      );
    });
  });
});
