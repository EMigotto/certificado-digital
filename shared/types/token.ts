/**
 * Service token domain types for C7 API authentication.
 *
 * Tokens are hashed before storage; the plain-text value is returned only
 * once at creation time. Dates are ISO-8601 strings at the API level.
 */

// ─── Token Scopes ─────────────────────────────────────────────────────────

/**
 * Granular permission scopes for service tokens.
 * Each scope grants access to a specific resource + operation pair.
 */
export type TokenScope =
  | 'certificates:read'
  | 'certificates:write'
  | 'certificates:delete'
  | 'policies:read'
  | 'policies:write'
  | 'zones:read'
  | 'zones:write'
  | 'tokens:read'
  | 'tokens:write'
  | 'audit:read'
  | 'admin';

// ─── ServiceToken ─────────────────────────────────────────────────────────

/** Full service token record (token hash is never exposed via the API) */
export interface ServiceToken {
  id: string;

  /** Human-readable token name (e.g. "CI Pipeline — staging") */
  name: string;

  /** First/last characters of the original token value for identification */
  tokenPreview: string;

  /** Granted permission scopes */
  scopes: TokenScope[];

  /** Record creation timestamp (ISO-8601) */
  createdAt: string;

  /** When the token expires (ISO-8601, null = never expires) */
  expiresAt: string | null;

  /** When the token was revoked (ISO-8601, null = not revoked) */
  revokedAt: string | null;

  /** Reason for revocation (null if not revoked) */
  revocationReason: string | null;

  /** Last time the token was used for authentication (ISO-8601, null = never) */
  lastUsedAt: string | null;

  /** User or system that created this token */
  createdBy: string;
}

// ─── Mutation Payloads ────────────────────────────────────────────────────

/** Payload for creating a new service token (system fields omitted) */
export interface ServiceTokenCreate {
  name: string;
  scopes: TokenScope[];
  expiresAt?: string | null;
}

/**
 * Response returned when a token is created.
 * `plainToken` is the raw token value — shown only once, never stored.
 */
export interface ServiceTokenCreateResponse {
  token: ServiceToken;
  plainToken: string;
}

/** Payload for revoking an existing service token */
export interface ServiceTokenRevoke {
  revocationReason: string;
}
