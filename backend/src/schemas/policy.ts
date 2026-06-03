/**
 * JSON Schemas for expiration policy API routes.
 */

/** Webhook configuration schema */
export const webhookSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    url: { type: 'string', format: 'uri', example: 'https://hooks.slack.com/services/...' },
    isActive: { type: 'boolean', default: true },
    headers: {
      type: 'object',
      additionalProperties: { type: 'string' },
      description: 'Custom HTTP headers sent with webhook requests',
    },
    createdAt: { type: 'string', format: 'date-time' },
  },
} as const;

/** Policy item schema */
export const policyItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string', example: 'Default Expiration Policy' },
    description: { type: 'string', nullable: true },
    zoneId: { type: 'string', format: 'uuid', nullable: true },
    isDefault: { type: 'boolean' },
    thresholds: {
      type: 'array',
      items: { type: 'integer' },
      description: 'Alert threshold days before expiration',
      example: [90, 60, 30, 14, 7],
    },
    emailEnabled: { type: 'boolean' },
    emailRecipientsAdditional: {
      type: 'array',
      items: { type: 'string', format: 'email' },
    },
    emailSubjectPrefix: { type: 'string', nullable: true },
    webhooks: {
      type: 'array',
      items: webhookSchema,
    },
    isActive: { type: 'boolean' },
    createdBy: { type: 'string' },
    updatedBy: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    deletedAt: { type: 'string', format: 'date-time', nullable: true },
  },
} as const;

/** Policy create request body schema */
export const policyCreateRequestSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 255 },
    description: { type: 'string', nullable: true },
    zoneId: { type: 'string', format: 'uuid', nullable: true },
    isDefault: { type: 'boolean', default: false },
    thresholds: {
      type: 'array',
      items: { type: 'integer', minimum: 1 },
      minItems: 1,
    },
    emailEnabled: { type: 'boolean', default: true },
    emailRecipientsAdditional: {
      type: 'array',
      items: { type: 'string', format: 'email' },
    },
    emailSubjectPrefix: { type: 'string', nullable: true },
    createdBy: { type: 'string', default: 'system' },
    webhooks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          url: { type: 'string', format: 'uri' },
          isActive: { type: 'boolean', default: true },
          headers: { type: 'object', additionalProperties: { type: 'string' } },
        },
        required: ['url'],
      },
    },
  },
  required: ['name', 'thresholds'],
} as const;

/** Policy list response schema */
export const policyListResponseSchema = {
  type: 'object',
  properties: {
    data: { type: 'array', items: policyItemSchema },
    total: { type: 'integer' },
    page: { type: 'integer' },
    pageSize: { type: 'integer' },
    totalPages: { type: 'integer' },
  },
  required: ['data', 'total', 'page', 'pageSize', 'totalPages'],
} as const;
