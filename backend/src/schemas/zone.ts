/**
 * JSON Schemas for zone API routes.
 */

/** Zone item schema */
export const zoneItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string', example: 'DMZ' },
    description: { type: 'string', nullable: true, example: 'Demilitarized Zone' },
    isActive: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
} as const;

/** Zone create request body schema */
export const zoneCreateRequestSchema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      description: 'Unique zone name',
    },
    description: {
      type: 'string',
      nullable: true,
      maxLength: 500,
      description: 'Optional zone description',
    },
  },
  required: ['name'],
} as const;

/** Zone list response schema */
export const zoneListResponseSchema = {
  type: 'object',
  properties: {
    data: { type: 'array', items: zoneItemSchema },
    total: { type: 'integer' },
  },
  required: ['data', 'total'],
} as const;
