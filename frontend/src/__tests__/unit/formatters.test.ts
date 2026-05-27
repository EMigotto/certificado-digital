import { describe, it, expect } from 'vitest';
import {
  truncateCn,
  formatDateTime,
  formatDate,
  daysUntilExpiry,
  formatDaysLeft,
  formatNumber,
  formatSansSummary,
  getStatusVariant,
  getStatusLabel,
} from '@/utils/formatters';

describe('truncateCn', () => {
  it('should return the original string if under limit', () => {
    expect(truncateCn('api-payments.bank.internal')).toBe('api-payments.bank.internal');
  });

  it('should truncate long CN with ellipsis', () => {
    const longCn = 'a'.repeat(50);
    const result = truncateCn(longCn, 40);
    expect(result).toHaveLength(41); // 40 chars + '…'
    expect(result.endsWith('…')).toBe(true);
  });

  it('should handle 255+ char CN (edge case FR10.3)', () => {
    const cn = 'x'.repeat(256) + '.bank.internal';
    const result = truncateCn(cn, 40);
    expect(result.length).toBeLessThanOrEqual(41);
  });

  it('should return empty string for empty input', () => {
    expect(truncateCn('')).toBe('');
  });

  it('should handle exact limit length', () => {
    const cn = 'a'.repeat(40);
    expect(truncateCn(cn, 40)).toBe(cn);
  });

  it('should respect custom maxLength', () => {
    const cn = 'a'.repeat(20);
    expect(truncateCn(cn, 10)).toBe('a'.repeat(10) + '…');
  });
});

describe('formatDateTime', () => {
  it('should format ISO date to pt-BR datetime', () => {
    const result = formatDateTime('2026-05-27T14:32:08.000Z');
    expect(result).toMatch(/27\/05\/2026/);
  });

  it('should return em-dash for empty string', () => {
    expect(formatDateTime('')).toBe('—');
  });

  it('should return em-dash for invalid date', () => {
    expect(formatDateTime('not-a-date')).toBe('—');
  });
});

describe('formatDate', () => {
  it('should format ISO date to pt-BR short date', () => {
    const result = formatDate('2026-05-27T14:32:08.000Z');
    expect(result).toMatch(/27\/05\/2026/);
  });

  it('should return em-dash for empty string', () => {
    expect(formatDate('')).toBe('—');
  });

  it('should return em-dash for invalid date', () => {
    expect(formatDate('invalid')).toBe('—');
  });
});

describe('daysUntilExpiry', () => {
  it('should return positive days for future date', () => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const days = daysUntilExpiry(future.toISOString());
    expect(days).toBeGreaterThanOrEqual(29);
    expect(days).toBeLessThanOrEqual(31);
  });

  it('should return negative days for past date (expired certs)', () => {
    const past = new Date();
    past.setDate(past.getDate() - 15);
    const days = daysUntilExpiry(past.toISOString());
    expect(days).toBeLessThanOrEqual(-14);
  });

  it('should return 0 for empty string', () => {
    expect(daysUntilExpiry('')).toBe(0);
  });
});

describe('formatDaysLeft', () => {
  it('should format positive days', () => {
    expect(formatDaysLeft(30)).toBe('30 dias');
  });

  it('should format 1 day singular', () => {
    expect(formatDaysLeft(1)).toBe('1 dia');
  });

  it('should format 0 as Hoje', () => {
    expect(formatDaysLeft(0)).toBe('Hoje');
  });

  it('should format negative days for expired certs (FR10 edge case)', () => {
    expect(formatDaysLeft(-15)).toBe('-15 dias');
  });

  it('should format -1 day singular', () => {
    expect(formatDaysLeft(-1)).toBe('-1 dia');
  });
});

describe('formatNumber', () => {
  it('should format with Brazilian thousands separator', () => {
    expect(formatNumber(2847)).toBe('2.847');
  });

  it('should format large numbers', () => {
    expect(formatNumber(10000)).toBe('10.000');
  });

  it('should format zero', () => {
    expect(formatNumber(0)).toBe('0');
  });
});

describe('formatSansSummary', () => {
  it('should return "+ 0 SANs" for empty array', () => {
    expect(formatSansSummary([])).toBe('+ 0 SANs');
  });

  it('should return singular "+ 1 SAN"', () => {
    expect(formatSansSummary(['a.com'])).toBe('+ 1 SAN');
  });

  it('should return plural for multiple SANs', () => {
    expect(formatSansSummary(['a.com', 'b.com'])).toBe('+ 2 SANs');
  });

  it('should handle 100+ SANs (edge case FR10.4)', () => {
    const sans = Array.from({ length: 120 }, (_, i) => `san-${i}.com`);
    expect(formatSansSummary(sans)).toBe('+ 120 SANs');
  });
});

describe('getStatusVariant', () => {
  it('should return "rev" for revoked certs', () => {
    expect(getStatusVariant(60, true)).toBe('rev');
  });

  it('should return "crit" for expired certs (days <= 0)', () => {
    expect(getStatusVariant(-15, false)).toBe('crit');
    expect(getStatusVariant(0, false)).toBe('crit');
  });

  it('should return "warn" for certs expiring within 30 days', () => {
    expect(getStatusVariant(1, false)).toBe('warn');
    expect(getStatusVariant(30, false)).toBe('warn');
  });

  it('should return "ok" for certs with more than 30 days', () => {
    expect(getStatusVariant(31, false)).toBe('ok');
    expect(getStatusVariant(365, false)).toBe('ok');
  });
});

describe('getStatusLabel', () => {
  it('should return "Revogado" for revoked certs', () => {
    expect(getStatusLabel(60, true)).toBe('Revogado');
  });

  it('should return "Vencido" for expired certs', () => {
    expect(getStatusLabel(-15, false)).toBe('Vencido');
    expect(getStatusLabel(0, false)).toBe('Vencido');
  });

  it('should return "Crítico" for certs expiring within 7 days', () => {
    expect(getStatusLabel(2, false)).toBe('Crítico');
    expect(getStatusLabel(7, false)).toBe('Crítico');
  });

  it('should return "Atenção" for certs expiring within 30 days', () => {
    expect(getStatusLabel(15, false)).toBe('Atenção');
    expect(getStatusLabel(30, false)).toBe('Atenção');
  });

  it('should return "Válido" for healthy certs', () => {
    expect(getStatusLabel(31, false)).toBe('Válido');
  });
});
