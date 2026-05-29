/**
 * QA Acceptance Criteria tests for Certificate Timeline & Audit Log lifecycle events.
 *
 * Covers:
 * - FR6 (6.1): Audit log entries for issue (timestamp, actor, action, result, details)
 * - FR6 (6.2): Audit log entries for renewal (old/new cert, rotate_key, notification)
 * - FR6 (6.3): Audit log entries for revocation (reason_code, justification)
 * - FR6 (6.4): Audit log shows failures (CA errors, validation errors)
 * - FR5 (5.1, 5.2): Timeline visualizes status transitions
 * - FR3 (3.5): Old and new certificates tracked via timeline links
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CertificateDetailPage from '@/pages/CertificateDetail/CertificateDetailPage';
import AuditLogPage from '@/pages/AuditLog/AuditLogPage';
import { AuditRow } from '@/pages/AuditLog/components/AuditRow';
import type { AuditLogEntry } from '@certificado-digital/shared';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

function renderWithProviders(ui: React.ReactElement, initialEntry = '/') {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="*" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderDetailPage(certId: string) {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/certificates/${certId}`]}>
        <Routes>
          <Route path="/certificates/:id" element={<CertificateDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── FR6 (6.1): Audit log entries for issue ─────────────────────────────────

describe('FR6.1 — Audit log entries for certificate issuance', () => {
  it('renders ISSUE action with lifecycle details in audit row', () => {
    const entry: AuditLogEntry = {
      id: 'a1',
      certId: 'cert-1',
      certCn: 'api-payments.bank.internal',
      action: 'ISSUE',
      actor: 'Rafael Costa',
      result: 'SUCCESS',
      detail: null,
      batchId: null,
      timestamp: '2024-06-15T10:30:00Z',
      lifecycleDetails: {
        caName: 'Vault PKI',
        algorithm: 'RSA 2048',
        cn: 'api-payments.bank.internal',
      },
    };

    render(<AuditRow entry={entry} />);

    // Verify action, actor, CN, result are present
    expect(screen.getByText('ISSUE')).toBeInTheDocument();
    expect(screen.getByText('Rafael Costa')).toBeInTheDocument();
    expect(screen.getByText('api-payments.bank.internal')).toBeInTheDocument();
    expect(screen.getByText('SUCCESS')).toBeInTheDocument();

    // Verify lifecycle details are rendered
    const details = screen.getByTestId('lifecycle-details');
    expect(details.textContent).toContain('Vault PKI');
    expect(details.textContent).toContain('RSA 2048');
  });

  it('renders timestamp in the audit row', () => {
    const entry: AuditLogEntry = {
      id: 'a2',
      certId: 'cert-1',
      certCn: 'test.bank.internal',
      action: 'ISSUE',
      actor: 'system',
      result: 'SUCCESS',
      detail: null,
      batchId: null,
      timestamp: '2024-06-15T10:30:00Z',
      lifecycleDetails: { caName: 'ACM PCA' },
    };

    render(<AuditRow entry={entry} />);
    const row = screen.getByTestId('audit-row');
    // Timestamp should be present (exact format depends on locale)
    expect(row.textContent).toContain('2024');
  });
});

// ─── FR6 (6.2): Audit log entries for renewal ───────────────────────────────

describe('FR6.2 — Audit log entries for certificate renewal', () => {
  it('renders RENEW action with old/new cert IDs and rotate_key flag', () => {
    const entry: AuditLogEntry = {
      id: 'a3',
      certId: 'cert-new',
      certCn: 'gateway.bank.internal',
      action: 'RENEW',
      actor: 'auto-renew',
      result: 'SUCCESS',
      detail: null,
      batchId: null,
      timestamp: '2024-06-20T08:00:00Z',
      lifecycleDetails: {
        oldCertId: 'cert-old-aaa',
        newCertId: 'cert-new-bbb',
        rotateKey: true,
      },
    };

    render(<AuditRow entry={entry} />);

    expect(screen.getByText('RENEW')).toBeInTheDocument();
    const details = screen.getByTestId('lifecycle-details');
    expect(details.textContent).toContain('cert-old');
    expect(details.textContent).toContain('cert-new');
    expect(details.textContent).toContain('key rotated');
  });
});

// ─── FR6 (6.3): Audit log entries for revocation ────────────────────────────

describe('FR6.3 — Audit log entries for certificate revocation', () => {
  it('renders REVOKE action with reason code and justification', () => {
    const entry: AuditLogEntry = {
      id: 'a4',
      certId: 'cert-revoked',
      certCn: 'compromised-svc.bank.internal',
      action: 'REVOKE',
      actor: 'sec-ops',
      result: 'SUCCESS',
      detail: null,
      batchId: null,
      timestamp: '2024-06-25T15:00:00Z',
      lifecycleDetails: {
        reasonCode: 'keyCompromise',
        justification: 'Private key exposed in log files',
      },
    };

    render(<AuditRow entry={entry} />);

    expect(screen.getByText('REVOKE')).toBeInTheDocument();
    const details = screen.getByTestId('lifecycle-details');
    expect(details.textContent).toContain('keyCompromise');
    expect(details.textContent).toContain('Private key exposed in log files');
  });
});

// ─── FR6 (6.4): Audit log shows failures ────────────────────────────────────

describe('FR6.4 — Audit log displays failure entries', () => {
  it('renders FAILURE result with proper styling', () => {
    const entry: AuditLogEntry = {
      id: 'a5',
      certId: null,
      certCn: 'failing-svc.bank.internal',
      action: 'ISSUE',
      actor: 'vault-agent',
      result: 'FAILURE',
      detail: 'CA unavailable',
      batchId: null,
      timestamp: '2024-06-26T09:00:00Z',
      lifecycleDetails: { caName: 'Vault PKI' },
    };

    render(<AuditRow entry={entry} />);

    expect(screen.getByText('FAILURE')).toBeInTheDocument();
    expect(screen.getByText('ISSUE')).toBeInTheDocument();
  });
});

// ─── FR5 (5.1, 5.2): Timeline visualizes status transitions ─────────────────

describe('FR5.1/5.2 — Timeline visualizes certificate status transitions', () => {
  it('renders the timeline panel on the detail page', async () => {
    renderDetailPage('cert-detail-1');

    await waitFor(() => {
      expect(screen.getByTestId('certificate-timeline')).toBeInTheDocument();
    });
  });

  it('shows timeline events with correct action badges', async () => {
    renderDetailPage('cert-detail-1');

    await waitFor(() => {
      const events = screen.getAllByTestId('timeline-event');
      expect(events.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('displays empty state for certificates with no timeline', async () => {
    renderDetailPage('no-timeline');

    await waitFor(() => {
      expect(screen.getByText(/No timeline data available/)).toBeInTheDocument();
    });
  });
});

// ─── FR3 (3.5): Renewal parent/child tracked via timeline links ─────────────

describe('FR3.5 — Old and new certificates tracked via timeline links', () => {
  it('displays a link to related certificate on renewed events', async () => {
    renderDetailPage('cert-detail-1');

    await waitFor(() => {
      const relatedLinks = screen.queryAllByText(/View related certificate/);
      expect(relatedLinks.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// ─── Audit filter dropdown includes lifecycle actions ────────────────────────

describe('Audit filters — lifecycle action types', () => {
  it('renders the audit log page with filter dropdown containing lifecycle actions', async () => {
    renderWithProviders(<AuditLogPage />, '/audit');

    await waitFor(() => {
      const select = screen.getByLabelText('Filtrar por ação');
      expect(select).toBeInTheDocument();
    });

    const select = screen.getByLabelText('Filtrar por ação') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);

    // Should include the new lifecycle action types
    expect(options).toContain('ISSUE');
    expect(options).toContain('RENEW');
    expect(options).toContain('KEY_ROTATED');
    expect(options).toContain('NOTIFICATION_SENT');
  });
});

// ─── Audit export buttons present ────────────────────────────────────────────

describe('Audit export enhancement', () => {
  it('renders CSV and JSON export buttons on the audit log page', async () => {
    renderWithProviders(<AuditLogPage />, '/audit');

    await waitFor(() => {
      expect(screen.getByText('↓ CSV')).toBeInTheDocument();
      expect(screen.getByText('↓ JSON')).toBeInTheDocument();
    });
  });
});

// ─── Additional lifecycle audit action types in audit rows ───────────────────

describe('Audit log — KEY_ROTATED and NOTIFICATION_SENT actions', () => {
  it('renders KEY_ROTATED with algorithm change details', () => {
    const entry: AuditLogEntry = {
      id: 'a6',
      certId: 'cert-1',
      certCn: 'svc.bank.internal',
      action: 'KEY_ROTATED',
      actor: 'admin',
      result: 'SUCCESS',
      detail: null,
      batchId: null,
      timestamp: '2024-07-01T12:00:00Z',
      lifecycleDetails: {
        oldAlgorithm: 'RSA 2048',
        newAlgorithm: 'ECDSA P-256',
      },
    };

    render(<AuditRow entry={entry} />);

    expect(screen.getByText('KEY_ROTATED')).toBeInTheDocument();
    const details = screen.getByTestId('lifecycle-details');
    expect(details.textContent).toContain('RSA 2048');
    expect(details.textContent).toContain('ECDSA P-256');
  });

  it('renders NOTIFICATION_SENT with recipient and subject', () => {
    const entry: AuditLogEntry = {
      id: 'a7',
      certId: 'cert-1',
      certCn: 'svc.bank.internal',
      action: 'NOTIFICATION_SENT',
      actor: 'system',
      result: 'SUCCESS',
      detail: null,
      batchId: null,
      timestamp: '2024-07-01T12:00:00Z',
      lifecycleDetails: {
        recipient: 'team@bank.internal',
        subject: 'Cert expiring in 7 days',
      },
    };

    render(<AuditRow entry={entry} />);

    expect(screen.getByText('NOTIFICATION_SENT')).toBeInTheDocument();
    const details = screen.getByTestId('lifecycle-details');
    expect(details.textContent).toContain('team@bank.internal');
    expect(details.textContent).toContain('Cert expiring in 7 days');
  });
});
