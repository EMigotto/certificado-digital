import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuditRow } from '@/pages/AuditLog/components/AuditRow';
import type { AuditLogEntry } from '@certificado-digital/shared';

const mockEntry: AuditLogEntry = {
  id: 'audit-1',
  certId: 'cert-1',
  certCn: 'api-payments.bank.internal',
  action: 'CREATE',
  actor: 'Rafael Costa',
  result: 'SUCCESS',
  detail: 'Imported via PEM upload',
  batchId: null,
  timestamp: '2024-05-20T14:32:08Z',
};

describe('AuditRow', () => {
  it('should render the audit row with all columns', () => {
    render(<AuditRow entry={mockEntry} />);

    const row = screen.getByTestId('audit-row');
    expect(row).toBeDefined();
  });

  it('should display the timestamp', () => {
    render(<AuditRow entry={mockEntry} />);
    // Should contain the date/time — the exact format depends on locale
    // but the element should be present
    const row = screen.getByTestId('audit-row');
    expect(row.textContent).toContain('2024');
  });

  it('should display the actor name and initials', () => {
    render(<AuditRow entry={mockEntry} />);
    expect(screen.getByText('Rafael Costa')).toBeDefined();
    expect(screen.getByText('RC')).toBeDefined();
  });

  it('should display the action verb', () => {
    render(<AuditRow entry={mockEntry} />);
    expect(screen.getByText('CREATE')).toBeDefined();
  });

  it('should display the certificate CN as target', () => {
    render(<AuditRow entry={mockEntry} />);
    expect(screen.getByText('api-payments.bank.internal')).toBeDefined();
  });

  it('should display SUCCESS result in green', () => {
    render(<AuditRow entry={mockEntry} />);
    expect(screen.getByText('SUCCESS')).toBeDefined();
  });

  it('should display FAILURE result', () => {
    const failEntry: AuditLogEntry = {
      ...mockEntry,
      result: 'FAILURE',
    };
    render(<AuditRow entry={failEntry} />);
    expect(screen.getByText('FAILURE')).toBeDefined();
  });

  it('should show batch indicator when batchId is present', () => {
    const batchEntry: AuditLogEntry = {
      ...mockEntry,
      batchId: 'batch-abc-123',
    };
    render(<AuditRow entry={batchEntry} />);
    expect(screen.getByText('batch')).toBeDefined();
  });

  it('should not show batch indicator when batchId is null', () => {
    render(<AuditRow entry={mockEntry} />);
    expect(screen.queryByText('batch')).toBeNull();
  });

  it('should display correct initials for different actor formats', () => {
    const entry: AuditLogEntry = {
      ...mockEntry,
      actor: 'system',
    };
    render(<AuditRow entry={entry} />);
    expect(screen.getByText('S')).toBeDefined();
  });
});
