import { describe, it, expect } from 'vitest';
import { parsePaginationParams, buildPaginatedResponse } from '../utils/pagination.js';

describe('parsePaginationParams', () => {
  it('should return defaults when no params provided', () => {
    const result = parsePaginationParams({});
    expect(result).toEqual({ page: 1, pageSize: 25, skip: 0, take: 25 });
  });

  it('should parse valid page and pageSize', () => {
    const result = parsePaginationParams({ page: '3', pageSize: '10' });
    expect(result).toEqual({ page: 3, pageSize: 10, skip: 20, take: 10 });
  });

  it('should accept numeric values', () => {
    const result = parsePaginationParams({ page: 2, pageSize: 50 });
    expect(result).toEqual({ page: 2, pageSize: 50, skip: 50, take: 50 });
  });

  it('should clamp page to minimum of 1', () => {
    const result = parsePaginationParams({ page: '0' });
    expect(result.page).toBe(1);
    expect(result.skip).toBe(0);
  });

  it('should clamp negative page to 1', () => {
    const result = parsePaginationParams({ page: '-5' });
    expect(result.page).toBe(1);
  });

  it('should clamp pageSize to maximum of 100', () => {
    const result = parsePaginationParams({ pageSize: '200' });
    expect(result.pageSize).toBe(100);
  });

  it('should default pageSize when 0 is given', () => {
    // 0 is not a valid pageSize, falls back to default
    const result = parsePaginationParams({ pageSize: '0' });
    expect(result.pageSize).toBe(25);
  });

  it('should clamp pageSize to minimum of 1 for small positive values', () => {
    const result = parsePaginationParams({ pageSize: '0.5' });
    expect(result.pageSize).toBe(1);
  });

  it('should floor non-integer values', () => {
    const result = parsePaginationParams({ page: '2.7', pageSize: '15.3' });
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(15);
  });

  it('should handle invalid strings gracefully', () => {
    const result = parsePaginationParams({ page: 'abc', pageSize: 'xyz' });
    expect(result).toEqual({ page: 1, pageSize: 25, skip: 0, take: 25 });
  });
});

describe('buildPaginatedResponse', () => {
  it('should build correct response with multiple pages', () => {
    const data = [{ id: 1 }, { id: 2 }];
    const result = buildPaginatedResponse(data, 50, 1, 25);
    expect(result).toEqual({
      data,
      total: 50,
      page: 1,
      pageSize: 25,
      totalPages: 2,
    });
  });

  it('should compute totalPages correctly with remainder', () => {
    const result = buildPaginatedResponse([], 51, 1, 25);
    expect(result.totalPages).toBe(3);
  });

  it('should return at least 1 total page even when empty', () => {
    const result = buildPaginatedResponse([], 0, 1, 25);
    expect(result.totalPages).toBe(1);
  });

  it('should return at least 1 total page with single item', () => {
    const result = buildPaginatedResponse([{ id: 1 }], 1, 1, 25);
    expect(result.totalPages).toBe(1);
  });

  it('should handle exact page boundary', () => {
    const result = buildPaginatedResponse([], 100, 1, 25);
    expect(result.totalPages).toBe(4);
  });
});
