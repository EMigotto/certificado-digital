/**
 * Tests for Express middleware — error handler and upload validation.
 *
 * Covers:
 *  - Error handler: JSON error responses, status codes, server error logging
 *  - Upload middleware: file type validation helpers
 *  - AC 2:  Invalid format error handling
 *  - AC 46: File type validation
 */
import { describe, it, expect } from 'vitest';
import {
  errorHandler,
  createApiError,
  type ApiError,
} from '../../src/server/middleware/error-handler.js';
import {
  isPemExtension,
  isPkcs12Extension,
  isCsvExtension,
} from '../../src/server/middleware/upload.js';
import type { Request, Response, NextFunction } from 'express';

/* ------------------------------------------------------------------ */
/* Error handler middleware                                             */
/* ------------------------------------------------------------------ */

describe('errorHandler middleware', () => {
  function createMockRes(): Response & { _statusCode: number; _body: unknown } {
    const res = {
      _statusCode: 200,
      _body: null,
      status(code: number) {
        res._statusCode = code;
        return res;
      },
      json(body: unknown) {
        res._body = body;
        return res;
      },
    } as unknown as Response & { _statusCode: number; _body: unknown };
    return res;
  }

  const mockReq = {} as Request;
  const mockNext = (() => {}) as NextFunction;

  it('returns 500 for generic Error', () => {
    const res = createMockRes();
    errorHandler(new Error('Something failed'), mockReq, res, mockNext);
    expect(res._statusCode).toBe(500);
    expect((res._body as { error: { message: string } }).error.message).toBe('Something failed');
  });

  it('returns custom status for ApiError', () => {
    const res = createMockRes();
    const apiErr = createApiError(400, 'Bad request', { field: 'owner' });
    errorHandler(apiErr, mockReq, res, mockNext);
    expect(res._statusCode).toBe(400);
    expect((res._body as { error: { message: string; details: unknown } }).error.message).toBe('Bad request');
    expect((res._body as { error: { details: unknown } }).error.details).toEqual({ field: 'owner' });
  });

  it('defaults to "Internal Server Error" for empty message', () => {
    const res = createMockRes();
    errorHandler({ status: 500, message: '' } as ApiError, mockReq, res, mockNext);
    expect(res._statusCode).toBe(500);
    expect((res._body as { error: { message: string } }).error.message).toBe('Internal Server Error');
  });

  it('handles ApiError without details', () => {
    const res = createMockRes();
    const apiErr = createApiError(404, 'Not found');
    errorHandler(apiErr, mockReq, res, mockNext);
    expect(res._statusCode).toBe(404);
    expect((res._body as { error: Record<string, unknown> }).error.details).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* createApiError helper                                               */
/* ------------------------------------------------------------------ */

describe('createApiError', () => {
  it('creates an ApiError with status and message', () => {
    const err = createApiError(422, 'Validation failed');
    expect(err.status).toBe(422);
    expect(err.message).toBe('Validation failed');
    expect(err.details).toBeUndefined();
  });

  it('creates an ApiError with details', () => {
    const err = createApiError(400, 'Bad input', { fields: ['owner'] });
    expect(err.details).toEqual({ fields: ['owner'] });
  });
});

/* ------------------------------------------------------------------ */
/* Upload file type validation helpers (AC 46)                         */
/* ------------------------------------------------------------------ */

describe('File extension validators (AC 46)', () => {
  it('isPemExtension accepts .pem, .crt, .cer', () => {
    expect(isPemExtension('cert.pem')).toBe(true);
    expect(isPemExtension('cert.crt')).toBe(true);
    expect(isPemExtension('cert.cer')).toBe(true);
    expect(isPemExtension('cert.PEM')).toBe(true); // case-insensitive
  });

  it('isPemExtension rejects non-PEM files', () => {
    expect(isPemExtension('cert.txt')).toBe(false);
    expect(isPemExtension('cert.csv')).toBe(false);
    expect(isPemExtension('cert.p12')).toBe(false);
    expect(isPemExtension('cert.json')).toBe(false);
  });

  it('isPkcs12Extension accepts .p12, .pfx', () => {
    expect(isPkcs12Extension('cert.p12')).toBe(true);
    expect(isPkcs12Extension('cert.pfx')).toBe(true);
    expect(isPkcs12Extension('cert.P12')).toBe(true);
  });

  it('isPkcs12Extension rejects non-PKCS12 files', () => {
    expect(isPkcs12Extension('cert.pem')).toBe(false);
    expect(isPkcs12Extension('cert.csv')).toBe(false);
    expect(isPkcs12Extension('cert.txt')).toBe(false);
  });

  it('isCsvExtension accepts .csv', () => {
    expect(isCsvExtension('data.csv')).toBe(true);
    expect(isCsvExtension('data.CSV')).toBe(true);
  });

  it('isCsvExtension rejects non-CSV files', () => {
    expect(isCsvExtension('data.txt')).toBe(false);
    expect(isCsvExtension('data.xlsx')).toBe(false);
    expect(isCsvExtension('data.pem')).toBe(false);
    expect(isCsvExtension('data.json')).toBe(false);
  });
});
