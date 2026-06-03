/**
 * Central export for all JSON Schema definitions.
 *
 * These schemas are used by @fastify/swagger to generate the
 * OpenAPI 3.0.0 specification and by route handlers for request
 * validation and response serialization.
 */

export * from './common.js';
export * from './certificate.js';
export * from './token.js';
export * from './csr.js';
export * from './policy.js';
export * from './zone.js';
