/**
 * JSON Schemas for certificate-related API routes.
 */

/** Certificate item schema (summary for list responses) */
export const certificateItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    commonName: { type: 'string', example: '*.example.com' },
    issuer: { type: 'string', example: "Let's Encrypt Authority X3" },
    serialNumber: { type: 'string' },
    validFrom: { type: 'string', format: 'date-time' },
    validTo: { type: 'string', format: 'date-time' },
    status: {
      type: 'string',
      enum: ['valid', 'expiring', 'expired', 'revoked'],
    },
    environment: { type: 'string', nullable: true, example: 'production' },
    application: { type: 'string', nullable: true, example: 'api-gateway' },
    owner: { type: 'string', nullable: true, example: 'platform-team' },
    zone: { type: 'string', nullable: true, example: 'DMZ' },
    keyType: { type: 'string', example: 'RSA' },
    keySize: { type: 'integer', example: 2048 },
    signatureAlgorithm: { type: 'string', example: 'SHA256withRSA' },
    subjectAlternativeNames: {
      type: 'array',
      items: { type: 'string' },
      example: ['example.com', '*.example.com'],
    },
    fingerprint: { type: 'string' },
    isSelfSigned: { type: 'boolean' },
    tags: { type: 'object', additionalProperties: { type: 'string' } },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    deletedAt: { type: 'string', format: 'date-time', nullable: true },
  },
} as const;

/** Certificate detail schema (full representation) */
export const certificateDetailSchema = {
  ...certificateItemSchema,
  properties: {
    ...certificateItemSchema.properties,
    rawPem: {
      type: 'string',
      nullable: true,
      description: 'Full PEM-encoded certificate data',
    },
  },
} as const;

/** Certificate list query parameters */
export const certificateListQuerySchema = {
  type: 'object',
  properties: {
    page: { type: 'integer', minimum: 1, default: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
    search: {
      type: 'string',
      description: 'Full-text search across commonName, issuer, serialNumber',
    },
    status: {
      type: 'string',
      enum: ['valid', 'expiring', 'expired', 'revoked'],
      description: 'Filter by certificate status',
    },
    environment: { type: 'string', description: 'Filter by environment' },
    application: { type: 'string', description: 'Filter by application' },
    owner: { type: 'string', description: 'Filter by owner' },
    zone: { type: 'string', description: 'Filter by zone' },
    sortBy: {
      type: 'string',
      description: 'Field name to sort by',
      default: 'validTo',
    },
    sortOrder: {
      type: 'string',
      enum: ['asc', 'desc'],
      default: 'asc',
      description: 'Sort direction',
    },
  },
} as const;

/** Certificate list response schema */
export const certificateListResponseSchema = {
  type: 'object',
  properties: {
    data: { type: 'array', items: certificateItemSchema },
    total: { type: 'integer' },
    page: { type: 'integer' },
    pageSize: { type: 'integer' },
    totalPages: { type: 'integer' },
  },
  required: ['data', 'total', 'page', 'pageSize', 'totalPages'],
} as const;

/** Certificate ID parameter schema */
export const certificateIdParamSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid', description: 'Certificate UUID' },
  },
  required: ['id'],
} as const;

/** Certificate export parameters schema */
export const certificateExportParamSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid', description: 'Certificate UUID' },
    format: {
      type: 'string',
      enum: ['pem', 'json'],
      description: 'Export format',
    },
  },
  required: ['id', 'format'],
} as const;

/** Filter metadata response schema */
export const filterMetaResponseSchema = {
  type: 'object',
  properties: {
    environments: { type: 'array', items: { type: 'string' } },
    applications: { type: 'array', items: { type: 'string' } },
    owners: { type: 'array', items: { type: 'string' } },
    zones: { type: 'array', items: { type: 'string' } },
    statuses: { type: 'array', items: { type: 'string' } },
  },
} as const;
