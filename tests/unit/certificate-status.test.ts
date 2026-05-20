/**
 * Tests for certificate status computation.
 * Covers AC Scenarios: 1.11, 1.12, 2.2, 7.1, 7.2
 */
import { describe, it, expect } from 'vitest';
import {
  daysUntilExpiration,
  computeStatus,
  statusLabel,
  statusColor,
  formatDaysLeft,
} from '../../src/models/certificate.js';
import { makeCert } from './helpers.js';

const NOW = new Date('2025-06-01T12:00:00Z');

describe('daysUntilExpiration', () => {
  it('returns positive days for future expiry', () => {
    const notAfter = new Date('2025-06-11T12:00:00Z');
    expect(daysUntilExpiration(notAfter, NOW)).toBe(10);
  });

  it('returns 0 for same-day expiry', () => {
    expect(daysUntilExpiration(NOW, NOW)).toBe(0);
  });

  it('returns negative for past expiry (AC 7.1)', () => {
    const notAfter = new Date('2025-05-29T12:00:00Z');
    expect(daysUntilExpiration(notAfter, NOW)).toBe(-3);
  });
});

/* ----- AC 1.11: Status badges ----- */
describe('computeStatus (AC 1.11 / 7.1 / 7.2)', () => {
  it('returns "valid" for cert expiring in >30 days', () => {
    const cert = makeCert({ notAfter: new Date('2025-07-15T00:00:00Z') });
    expect(computeStatus(cert, NOW)).toBe('valid');
  });

  it('returns "attention" for cert expiring in 7–30 days (AC 1.11)', () => {
    const cert = makeCert({ notAfter: new Date('2025-06-19T00:00:00Z') }); // 18 days
    expect(computeStatus(cert, NOW)).toBe('attention');
  });

  it('returns "attention" for cert expiring in exactly 30 days', () => {
    const cert = makeCert({ notAfter: new Date('2025-07-01T12:00:00Z') }); // 30 days
    expect(computeStatus(cert, NOW)).toBe('attention');
  });

  it('returns "critical" for cert expiring in <7 days (AC 1.11)', () => {
    const cert = makeCert({ notAfter: new Date('2025-06-03T12:00:00Z') }); // 2 days
    expect(computeStatus(cert, NOW)).toBe('critical');
  });

  it('returns "expired" when notAfter is in the past (AC 7.1)', () => {
    const cert = makeCert({ notAfter: new Date('2025-05-20T00:00:00Z') });
    expect(computeStatus(cert, NOW)).toBe('expired');
  });

  it('returns "expired" when notAfter equals now (0 days)', () => {
    const cert = makeCert({ notAfter: NOW });
    expect(computeStatus(cert, NOW)).toBe('expired');
  });

  it('returns "revoked" regardless of dates if cert is revoked (AC 7.2)', () => {
    const cert = makeCert({
      notAfter: new Date('2025-12-31T00:00:00Z'),
      revoked: true,
    });
    expect(computeStatus(cert, NOW)).toBe('revoked');
  });

  it('returns "revoked" even if cert would otherwise be critical (AC 7.2)', () => {
    const cert = makeCert({
      notAfter: new Date('2025-06-02T00:00:00Z'),
      revoked: true,
    });
    expect(computeStatus(cert, NOW)).toBe('revoked');
  });
});

/* ----- AC 1.11: Badge labels ----- */
describe('statusLabel (AC 1.11)', () => {
  it('maps "critical" → "Crítico"', () => {
    expect(statusLabel('critical')).toBe('Crítico');
  });
  it('maps "attention" → "Atenção"', () => {
    expect(statusLabel('attention')).toBe('Atenção');
  });
  it('maps "valid" → "Válido"', () => {
    expect(statusLabel('valid')).toBe('Válido');
  });
  it('maps "expired" → "Expirado" (AC 7.1)', () => {
    expect(statusLabel('expired')).toBe('Expirado');
  });
  it('maps "revoked" → "Revogado" (AC 7.2)', () => {
    expect(statusLabel('revoked')).toBe('Revogado');
  });
});

/* ----- AC 1.12: Days-to-expiration color coding ----- */
describe('statusColor (AC 1.12)', () => {
  it('critical → "crit" (red)', () => {
    expect(statusColor('critical')).toBe('crit');
  });
  it('expired → "crit" (red)', () => {
    expect(statusColor('expired')).toBe('crit');
  });
  it('attention → "warn" (yellow)', () => {
    expect(statusColor('attention')).toBe('warn');
  });
  it('valid → "ok" (green)', () => {
    expect(statusColor('valid')).toBe('ok');
  });
  it('revoked → "rev" (purple)', () => {
    expect(statusColor('revoked')).toBe('rev');
  });
});

/* ----- AC 1.12 / 7.1: Days formatting ----- */
describe('formatDaysLeft (AC 1.12)', () => {
  it('formats positive days', () => {
    expect(formatDaysLeft(12)).toBe('12 dias');
  });
  it('formats zero days (AC 7.1)', () => {
    expect(formatDaysLeft(0)).toBe('0 dias');
  });
  it('formats negative days (AC 7.1)', () => {
    expect(formatDaysLeft(-3)).toBe('-3 dias');
  });
});

/* ----- AC 2.2: Expiration countdown display ----- */
describe('Expiration countdown (AC 2.2)', () => {
  it('shows "2 dias" for cert expiring in 2 days', () => {
    const cert = makeCert({ notAfter: new Date('2025-06-03T12:00:00Z') });
    const days = daysUntilExpiration(cert.notAfter, NOW);
    expect(days).toBe(2);
    expect(formatDaysLeft(days)).toBe('2 dias');
    expect(computeStatus(cert, NOW)).toBe('critical');
  });
});
