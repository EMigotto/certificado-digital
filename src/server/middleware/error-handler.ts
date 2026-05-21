/**
 * Express global error-handling middleware.
 *
 * Catches synchronous errors thrown in route handlers and any errors
 * passed via `next(err)`.  Returns a consistent JSON error response.
 */

import type { Request, Response, NextFunction } from 'express';

export interface ApiError {
  status: number;
  message: string;
  details?: unknown;
}

/**
 * Create an ApiError with the given status and message.
 */
export function createApiError(status: number, message: string, details?: unknown): ApiError {
  return { status, message, details };
}

/**
 * Express error-handling middleware (must have 4 params to be recognised).
 */
export function errorHandler(
  err: ApiError | Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Determine HTTP status code
  const status = 'status' in err && typeof err.status === 'number' ? err.status : 500;
  const message = err.message || 'Internal Server Error';
  const details = 'details' in err ? err.details : undefined;

  // Log server errors to stderr
  if (status >= 500) {
    console.error('[ERROR]', message, details ?? '');
  }

  res.status(status).json({
    error: {
      status,
      message,
      ...(details !== undefined && { details }),
    },
  });
}
