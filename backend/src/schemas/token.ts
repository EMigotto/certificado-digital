/**
 * JSON Schemas for service token API routes.
 *
 * These schemas define the expected request/response shapes for
 * token CRUD operations (C7 feature: Service Token Auth).
 */

/** Token create request body schema */
export const tokenCreateRequestSchema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 255,
      description: 'Human-readable token name',
      example: 'CI/CD Pipeline Token',
    },
    scopes: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['certificates:read', 'certificates:write', 'admin'],
      },
      minItems: 1,
      description: 'Permission scopes granted to this token',
      example: ['certificates:read'],
    },
    expiresAt: {
      type: 'string',
      format: 'date-time',
      nullable: true,
      description: 'Optional expiry timestamp (null = never expires)',
    },
  },
  required: ['name', 'scopes'],
} as const;

/** Token create response schema (includes plain-text token, shown only once) */
export const tokenCreateResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    token: {
      type: 'string',
      description: 'Plain-text token value — shown only at creation time',
    },
    preview: {
      type: 'string',
      description: 'Masked preview (last 8 chars) for identification',
      example: '****abcd1234',
    },
    scopes: {
      type: 'array',
      items: { type: 'string' },
    },
    expiresAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'name', 'token', 'preview', 'scopes', 'createdAt'],
} as const;

/** Token list item schema (no plain-text token) */
export const tokenListItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    preview: { type: 'string' },
    scopes: {
      type: 'array',
      items: { type: 'string' },
    },
    expiresAt: { type: 'string', format: 'date-time', nullable: true },
    revokedAt: { type: 'string', format: 'date-time', nullable: true },
    lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
} as const;

/** Token list response schema */
export const tokenListResponseSchema = {
  type: 'object',
  properties: {
    data: { type: 'array', items: tokenListItemSchema },
    total: { type: 'integer' },
  },
  required: ['data', 'total'],
} as const;
