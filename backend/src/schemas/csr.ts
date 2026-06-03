/**
 * JSON Schemas for Certificate Signing Request (CSR) API routes.
 */

/** CSR generation request body schema */
export const csrRequestSchema = {
  type: 'object',
  properties: {
    commonName: {
      type: 'string',
      minLength: 1,
      maxLength: 255,
      description: 'Common Name (CN) for the certificate',
      example: 'api.example.com',
    },
    organization: {
      type: 'string',
      description: 'Organization (O)',
      example: 'Acme Corp',
    },
    organizationalUnit: {
      type: 'string',
      description: 'Organizational Unit (OU)',
      example: 'Engineering',
    },
    country: {
      type: 'string',
      minLength: 2,
      maxLength: 2,
      description: 'Country code (C) — ISO 3166-1 alpha-2',
      example: 'BR',
    },
    state: {
      type: 'string',
      description: 'State or Province (ST)',
      example: 'São Paulo',
    },
    locality: {
      type: 'string',
      description: 'Locality / City (L)',
      example: 'São Paulo',
    },
    subjectAlternativeNames: {
      type: 'array',
      items: { type: 'string' },
      description: 'Subject Alternative Names (SANs)',
      example: ['api.example.com', '*.api.example.com'],
    },
    keyType: {
      type: 'string',
      enum: ['RSA', 'EC'],
      default: 'RSA',
      description: 'Key algorithm type',
    },
    keySize: {
      type: 'integer',
      enum: [2048, 3072, 4096],
      default: 2048,
      description: 'Key size in bits (RSA only)',
    },
  },
  required: ['commonName'],
} as const;

/** CSR generation response schema */
export const csrResponseSchema = {
  type: 'object',
  properties: {
    csr: {
      type: 'string',
      description: 'PEM-encoded Certificate Signing Request',
    },
    privateKey: {
      type: 'string',
      description: 'PEM-encoded private key (encrypted at rest)',
    },
    publicKey: {
      type: 'string',
      description: 'PEM-encoded public key',
    },
    fingerprint: {
      type: 'string',
      description: 'SHA-256 fingerprint of the public key',
    },
    commonName: { type: 'string' },
    subjectAlternativeNames: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['csr', 'privateKey', 'publicKey', 'fingerprint', 'commonName'],
} as const;
