/**
 * JSON Schemas for certificate-related API routes.
 */

/** Certificate item schema (summary for list responses) */
export const certificateItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    commonName: { type: 'string', example: '*.example.com' },
    subjectDn: { type: 'string', nullable: true },
    issuerDn: { type: 'string', nullable: true },
    sans: { type: 'array', items: { type: 'string' } },
    serialNumber: { type: 'string' },
    notBefore: { type: 'string', format: 'date-time' },
    notAfter: { type: 'string', format: 'date-time' },
    status: {
      type: 'string',
      enum: ['VALID', 'EXPIRING_SOON', 'EXPIRED', 'REVOKED'],
    },
    signatureAlgorithm: { type: 'string', example: 'SHA256withRSA' },
    keySize: { type: 'integer', nullable: true, example: 2048 },
    fingerprintSha256: { type: 'string' },
    fingerprintSha1: { type: 'string', nullable: true },
    owner: { type: 'string', example: 'platform-team' },
    team: { type: 'string', nullable: true },
    application: { type: 'string', example: 'api-gateway' },
    environment: { type: 'string', example: 'PRD' },
    zone: { type: 'string', nullable: true, example: 'DMZ' },
    caName: { type: 'string' },
    caProvider: { type: 'string', nullable: true },
    importSource: { type: 'string', nullable: true },
    sourceFile: { type: 'string', nullable: true },
    revoked: { type: 'boolean' },
    revokedAt: { type: 'string', format: 'date-time', nullable: true },
    revocationReason: { type: 'string', nullable: true },
    tags: { type: 'object', additionalProperties: { type: 'string' } },
    customFields: { type: 'object', additionalProperties: { type: 'string' } },
    description: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    daysUntilExpiry: { type: 'integer', description: 'Days until certificate expires' },
  },
} as const;

/** Certificate detail schema (full representation) */
export const certificateDetailSchema = {
  ...certificateItemSchema,
  properties: {
    ...certificateItemSchema.properties,
  },
} as const;

/** Certificate list query parameters */
export const certificateListQuerySchema = {
  type: 'object',
  properties: {
    page: { type: 'integer', minimum: 1, default: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
      description: 'Alias for pageSize',
    },
    q: {
      type: 'string',
      description: 'Full-text search across commonName, serialNumber, owner, application',
    },
    search: {
      type: 'string',
      description: 'Full-text search across commonName, issuer, serialNumber',
    },
    status: {
      type: 'string',
      description: 'Filter by certificate status (comma-separated)',
    },
    'filter[status]': {
      type: 'string',
      description: 'PRD-style filter by status (comma-separated)',
    },
    environment: { type: 'string', description: 'Filter by environment (comma-separated)' },
    'filter[environment]': {
      type: 'string',
      description: 'PRD-style filter by environment (comma-separated)',
    },
    application: { type: 'string', description: 'Filter by application' },
    owner: { type: 'string', description: 'Filter by owner (comma-separated)' },
    zone: { type: 'string', description: 'Filter by zone' },
    ca: { type: 'string', description: 'Filter by CA name (comma-separated)' },
    algorithm: { type: 'string', description: 'Filter by algorithm (comma-separated)' },
    tags: {
      type: 'string',
      description: 'Filter by tags (format: key1:value1,key2:value2)',
    },
    expiresIn: {
      type: 'string',
      description: 'Expiration window filter: <7d, <30d, <90d, >90d',
    },
    sort: {
      type: 'string',
      description:
        'Field name to sort by. Prefix with - for descending (e.g. -notAfter).',
      default: 'notAfter',
    },
    sortDir: {
      type: 'string',
      enum: ['asc', 'desc'],
      default: 'asc',
      description: 'Sort direction (overridden by - prefix in sort field)',
    },
    sortBy: {
      type: 'string',
      description: 'Alias for sort (deprecated)',
    },
    sortOrder: {
      type: 'string',
      enum: ['asc', 'desc'],
      default: 'asc',
      description: 'Alias for sortDir (deprecated)',
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
    caNames: { type: 'array', items: { type: 'string' } },
    statuses: { type: 'array', items: { type: 'string' } },
    owners: { type: 'array', items: { type: 'string' } },
    algorithms: { type: 'array', items: { type: 'string' } },
    tagKeys: { type: 'array', items: { type: 'string' } },
  },
} as const;

/** POST /api/certificates — Create certificate body schema */
export const certificateCreateBodySchema = {
  type: 'object',
  required: [
    'commonName',
    'serialNumber',
    'notBefore',
    'notAfter',
    'signatureAlgorithm',
    'fingerprintSha256',
    'owner',
    'application',
    'environment',
  ],
  properties: {
    commonName: { type: 'string', minLength: 1, description: 'Certificate common name (CN)' },
    subjectDn: { type: 'string', nullable: true, description: 'Full subject DN' },
    issuerDn: { type: 'string', nullable: true, description: 'Issuer DN' },
    sans: {
      type: 'array',
      items: { type: 'string' },
      default: [],
      description: 'Subject Alternative Names',
    },
    serialNumber: { type: 'string', minLength: 1, description: 'Certificate serial number' },
    notBefore: { type: 'string', format: 'date-time', description: 'Validity start (ISO-8601)' },
    notAfter: { type: 'string', format: 'date-time', description: 'Validity end (ISO-8601)' },
    signatureAlgorithm: { type: 'string', minLength: 1, description: 'e.g. SHA256withRSA' },
    keySize: { type: 'integer', nullable: true, description: 'Key size in bits' },
    fingerprintSha256: {
      type: 'string',
      minLength: 1,
      description: 'SHA-256 fingerprint (must be unique)',
    },
    fingerprintSha1: { type: 'string', nullable: true, description: 'SHA-1 fingerprint' },
    owner: { type: 'string', minLength: 1, description: 'Certificate owner / team lead' },
    team: { type: 'string', nullable: true, description: 'Team name' },
    application: { type: 'string', minLength: 1, description: 'Application identifier' },
    environment: {
      type: 'string',
      enum: ['DEV', 'HML', 'PRD'],
      description: 'Deployment environment',
    },
    zone: { type: 'string', nullable: true, description: 'Network zone' },
    caName: { type: 'string', description: 'Certificate Authority name', default: 'Unknown' },
    caProvider: { type: 'string', nullable: true, description: 'CA provider' },
    tags: {
      type: 'object',
      additionalProperties: { type: 'string' },
      default: {},
      description: 'Key-value tags',
    },
    customFields: {
      type: 'object',
      additionalProperties: { type: 'string' },
      default: {},
      description: 'Custom metadata fields',
    },
    description: { type: 'string', nullable: true, description: 'Free-form description' },
    pemData: { type: 'string', nullable: true, description: 'Raw PEM-encoded certificate' },
  },
  additionalProperties: false,
} as const;

/** PATCH /api/certificates/:id — Update certificate body schema */
export const certificateUpdateBodySchema = {
  type: 'object',
  properties: {
    owner: { type: 'string', description: 'Certificate owner' },
    team: { type: 'string', nullable: true, description: 'Team name' },
    application: { type: 'string', description: 'Application identifier' },
    environment: {
      type: 'string',
      enum: ['DEV', 'HML', 'PRD'],
      description: 'Deployment environment',
    },
    zone: { type: 'string', nullable: true, description: 'Network zone' },
    caName: { type: 'string', description: 'Certificate Authority name' },
    caProvider: { type: 'string', nullable: true, description: 'CA provider' },
    tags: {
      type: 'object',
      additionalProperties: { type: 'string' },
      description: 'Key-value tags',
    },
    customFields: {
      type: 'object',
      additionalProperties: { type: 'string' },
      description: 'Custom metadata fields',
    },
    description: { type: 'string', nullable: true, description: 'Free-form description' },
  },
  additionalProperties: false,
} as const;
