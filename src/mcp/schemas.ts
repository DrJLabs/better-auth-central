import { z } from "zod";

export const OAuthTokenResponseSchema = z.object({
  access_token: z.string().min(1, "access_token is required"),
  token_type: z.string().min(1, "token_type is required"),
  expires_in: z.coerce.number().min(0, "expires_in must be non-negative"),
  scope: z.string().min(1, "scope is required"),
  client_id: z.string().min(1, "client_id is required"),
  resource: z.string().min(1, "resource is required"),
});

export type OAuthTokenResponse = z.infer<typeof OAuthTokenResponseSchema>;

export const OAuthIntrospectionResponseSchema = z.object({
  active: z.boolean(),
  client_id: z.string().min(1, "client_id is required"),
  resource: z.string().min(1, "resource is required"),
  issued_token_type: z.string().min(1, "issued_token_type is required"),
  scope: z.string().min(1, "scope is required"),
});

export type OAuthIntrospectionResponse = z.infer<typeof OAuthIntrospectionResponseSchema>;

export const McpSessionSchema = z.object({
  userId: z.string().min(1, "userId is required"),
  clientId: z.string().min(1, "clientId is required"),
  scopes: z.array(z.string().min(1)).nonempty("scopes cannot be empty"),
  issuedAt: z.string().min(1, "issuedAt is required"),
  expiresAt: z.string().min(1, "expiresAt is required"),
  resource: z.string().min(1, "resource is required"),
});

export type McpSession = z.infer<typeof McpSessionSchema>;

export const McpHandshakeMetadataSchema = z.object({
  authorization_endpoint: z.string().min(1),
  token_endpoint: z.string().min(1),
  introspection_endpoint: z.string().min(1),
  revocation_endpoint: z.string().min(1),
  consent_endpoint: z.string().min(1),
  discovery_endpoint: z.string().min(1),
  jwks_uri: z.string().min(1),
});

export type McpHandshakeMetadata = z.infer<typeof McpHandshakeMetadataSchema>;

export const McpHandshakeResponseSchema = z.object({
  clientId: z.string().min(1),
  resource: z.string().min(1),
  scopes: z.array(z.string().min(1)).nonempty(),
  metadata: McpHandshakeMetadataSchema,
  endpoints: z.object({
    authorization: z.string().min(1),
    token: z.string().min(1),
    introspection: z.string().min(1),
    revocation: z.string().min(1),
    consent: z.string().min(1),
    discovery: z.string().min(1),
    session: z.string().min(1),
    serversMetadata: z.string().min(1),
  }),
});

export type McpHandshakeResponse = z.infer<typeof McpHandshakeResponseSchema>;
