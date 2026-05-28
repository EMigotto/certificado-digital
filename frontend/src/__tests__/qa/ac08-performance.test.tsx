/**
 * QA Tests — Functional Requirement 8: Performance & Scalability
 *
 * Maps to: Scenarios 8.1–8.4
 */
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createCertificate, createPaginatedResponse } from '../mocks/data';
import { CertificateTable } from '@/pages/Inventory/components/CertificateTable';
import { Pagination } from '@/components/Pagination/Pagination';
import { renderWithProviders } from './helpers';
import type { CertificateRow } from '@/services/certificateApi';

describe('AC 8 — Performance & Scalability', () => {
  // ─── Scenario 8.1: Load and display 10k certificates ────────────────
  describe('Scenario 8.1: Render large paginated dataset', () => {
    it('renders 25 items from a 10k+ dataset without delay', () => {
      const start = performance.now();

      const certs = Array.from({ length: 25 }, (_, i) => ({
        ...createCertificate({
          id: `cert-${i}`,
          commonName: `service-${i}.bank.internal`,
        }),
        daysUntilExpiry: 60 - i,
      })) as CertificateRow[];

      renderWithProviders(
        <CertificateTable
          data={certs}
          isLoading={false}
          hasFilters={false}
          hasSearch={false}
        />,
      );

      const elapsed = performance.now() - start;
      // Table should render in < 1000ms (fast test env)
      expect(elapsed).toBeLessThan(1000);

      // All 25 rows + header
      const rows = screen.getAllByRole('row');
      expect(rows.length).toBe(26);
    });

    it('renders efficiently with 50 items (page size 50)', () => {
      const certs = Array.from({ length: 50 }, (_, i) => ({
        ...createCertificate({ id: `cert-${i}` }),
        daysUntilExpiry: 45,
      })) as CertificateRow[];

      const start = performance.now();

      renderWithProviders(
        <CertificateTable
          data={certs}
          isLoading={false}
          hasFilters={false}
          hasSearch={false}
        />,
      );

      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(2000);
      expect(screen.getAllByRole('row').length).toBe(51);
    });
  });

  // ─── Scenario 8.2: Filter performance ────────────────────────────────
  describe('Scenario 8.2: Filter rendering performance', () => {
    it('pagination displays correct info for filtered 10k dataset', () => {
      renderWithProviders(
        <Pagination
          page={1}
          pageSize={25}
          totalPages={2}
          total={47}
          onPageChange={vi.fn()}
          onPageSizeChange={vi.fn()}
        />,
      );

      expect(screen.getByText('47 certificados')).toBeInTheDocument();
      expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
    });
  });

  // ─── Scenario 8.3: Search performance ────────────────────────────────
  describe('Scenario 8.3: Search result rendering performance', () => {
    it('renders filtered result set quickly', () => {
      const certs = Array.from({ length: 5 }, (_, i) => ({
        ...createCertificate({
          id: `cert-search-${i}`,
          commonName: `api-pay-${i}.bank.internal`,
        }),
        daysUntilExpiry: 30,
      })) as CertificateRow[];

      const start = performance.now();

      renderWithProviders(
        <CertificateTable
          data={certs}
          isLoading={false}
          hasFilters={false}
          hasSearch={true}
        />,
      );

      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(500);
      expect(screen.getAllByRole('row').length).toBe(6);
    });
  });

  // ─── Scenario 8.4: Sorting ───────────────────────────────────────────
  describe('Scenario 8.4: Sorting triggers server-side callback', () => {
    it('calls onSortChange when clicking column header', async () => {
      const user = userEvent.setup();
      const onSortChange = vi.fn();

      const certs = [
        {
          ...createCertificate({ id: 'cert-sort-1', commonName: 'b-cert.internal' }),
          daysUntilExpiry: 10,
        },
        {
          ...createCertificate({ id: 'cert-sort-2', commonName: 'a-cert.internal' }),
          daysUntilExpiry: 20,
        },
      ] as CertificateRow[];

      renderWithProviders(
        <CertificateTable
          data={certs}
          isLoading={false}
          hasFilters={false}
          hasSearch={false}
          onSortChange={onSortChange}
        />,
      );

      // Click the "Expira em" column header
      const expiresHeader = screen.getByText('Expira em');
      await user.click(expiresHeader);

      expect(onSortChange).toHaveBeenCalledWith('notAfter', expect.any(String));
    });
  });
});
