/**
 * Common JSON Schemas shared across API routes.
 *
 * Includes pagination, error responses, and reusable definitions.
 */

/** Standard error response schema */
export const errorResponseSchema = {
  type: 'object',
  properties: {
    statusCode: { type: 'integer', example: 400 },
    error: { type: 'string', example: 'Bad Request' },
    message: { type: 'string', example: 'Validation failed' },
  },
  required: ['statusCode', 'error', 'message'],
} as const;

/** 404 Not Found error response schema */
export const notFoundResponseSchema = {
  type: 'object',
  properties: {
    statusCode: { type: 'integer', example: 404 },
    error: { type: 'string', example: 'Not Found' },
    message: { type: 'string', example: 'Resource not found' },
  },
  required: ['statusCode', 'error', 'message'],
} as const;

/** 409 Conflict error response schema */
export const conflictResponseSchema = {
  type: 'object',
  properties: {
    statusCode: { type: 'integer', example: 409 },
    error: { type: 'string', example: 'Conflict' },
    message: { type: 'string', example: 'Resource already exists or is in conflicting state' },
  },
  required: ['statusCode', 'error', 'message'],
} as const;

/** Pagination query parameters schema */
export const paginationQuerySchema = {
  type: 'object',
  properties: {
    page: {
      type: 'integer',
      minimum: 1,
      default: 1,
      description: 'Page number (1-based)',
    },
    pageSize: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
      default: 25,
      description: 'Number of items per page (max 100)',
    },
  },
} as const;

/** Paginated response wrapper schema (generic — data type defined per-route) */
export const paginatedResponseSchema = {
  type: 'object',
  properties: {
    data: { type: 'array', items: {} },
    total: { type: 'integer', description: 'Total number of matching records' },
    page: { type: 'integer', description: 'Current page number' },
    pageSize: { type: 'integer', description: 'Items per page' },
    totalPages: { type: 'integer', description: 'Total number of pages' },
  },
  required: ['data', 'total', 'page', 'pageSize', 'totalPages'],
} as const;

/** Health check response schema */
export const healthResponseSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', example: 'ok' },
    timestamp: { type: 'string', format: 'date-time' },
  },
  required: ['status', 'timestamp'],
} as const;
