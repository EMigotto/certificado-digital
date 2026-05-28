/**
 * QA Tests — Functional Requirement 1: Display Certificate Inventory List
 *
 * Maps to: Scenarios 1.1, 1.2, 1.3, 1.4
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import {
  createCertificate,
  createPaginatedResponse,
} from '../mocks/data';
import { Pagination } from '@/components/Pagination/Pagination';
import { CertificateTable } from '@/pages/Inventory/components/CertificateTable';
import { EmptyState } from '@/pages/Inventory/components/EmptyState';
import { CnCell } from '@/components/Table/CnCell';
import { DaysLeft } from '@/components/Table/DaysLeft';
import { EnvTag } from '@/components/Table/EnvTag';
import { Badge } from '@/components/Badge/Badge';
import { renderWithProviders } from './helpers';
import type { CertificateRow } from '@/services/certificateApi';

describe('AC 1 — Display Certificate Inventory List', () => {
  const user = userEvent.setup();

  // ─── Scenario 1.1: Inventory list with pagination defaults ─────────────
  describe('Scenario 1.1: Display inventory list with 10k+ certificates', () => {
    it('renders the certificate table with 25 items by default', async () => {
      const certs = Array.from({ length: 25 }, (_, i) =>
        createCertificate({
          id: `cert-${i}`,
          commonName: `service-${i}.bank.internal`,
        }),
      );

      server.use(
        http.get('/api/certificates', () =>
          HttpResponse.json(createPaginatedResponse(certs, 1, 25, 10847)),
        ),
      );

      renderWithProviders(
        <CertificateTable
          data={certs.map((c) => ({ ...c, daysUntilExpiry: 45 })) as CertificateRow[]}
          isLoading={false}
          hasFilters={false}
          hasSearch={false}
        />,
      );

      // Table should render all 25 rows
      const rows = screen.getAllByRole('row');
      // 1 header row + 25 data rows
      expect(rows.length).toBe(26);
    });

    it('shows the correct column headers', () => {
      const certs = [
        { ...createCertificate(), daysUntilExpiry: 45 } as CertificateRow,
      ];

      renderWithProviders(
        <CertificateTable
          data={certs}
          isLoading={false}
          hasFilters={false}
          hasSearch={false}
        />,
      );

      expect(screen.getByText('Common Name / SANs')).toBeInTheDocument();
      expect(screen.getByText('Zona / Env')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('CA / Algoritmo')).toBeInTheDocument();
      expect(screen.getByText('Owner')).toBeInTheDocument();
      expect(screen.getByText('Expira em')).toBeInTheDocument();
    });

    it('shows loading skeleton when isLoading=true and data is empty', () => {
      renderWithProviders(
        <CertificateTable
          data={[]}
          isLoading={true}
          hasFilters={false}
          hasSearch={false}
        />,
      );

      // Skeleton should render placeholder rows
      const rows = screen.getAllByRole('row');
      // header + 5 skeleton rows
      expect(rows.length).toBe(6);
    });
  });

  // ─── Scenario 1.2: Pagination works correctly ────────────────────────
  describe('Scenario 1.2: Pagination works correctly', () => {
    it('shows correct page info and total count', () => {
      const onPageChange = vi.fn();
      const onPageSizeChange = vi.fn();

      renderWithProviders(
        <Pagination
          page={1}
          pageSize={25}
          totalPages={4}
          total={100}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />,
      );

      expect(screen.getByText('Página 1 de 4')).toBeInTheDocument();
      expect(screen.getByText('100 certificados')).toBeInTheDocument();
    });

    it('calls onPageChange when "Next page" is clicked', async () => {
      const onPageChange = vi.fn();
      const onPageSizeChange = vi.fn();

      renderWithProviders(
        <Pagination
          page={1}
          pageSize={25}
          totalPages={4}
          total={100}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />,
      );

      const nextBtn = screen.getByRole('button', { name: /próxima página/i });
      await user.click(nextBtn);
      expect(onPageChange).toHaveBeenCalledWith(2);
    });

    it('disables "Previous page" on page 1', () => {
      renderWithProviders(
        <Pagination
          page={1}
          pageSize={25}
          totalPages={4}
          total={100}
          onPageChange={vi.fn()}
          onPageSizeChange={vi.fn()}
        />,
      );

      const prevBtn = screen.getByRole('button', { name: /página anterior/i });
      expect(prevBtn).toBeDisabled();
    });

    it('calls onPageSizeChange when page size dropdown changes to 50', async () => {
      const onPageSizeChange = vi.fn();

      renderWithProviders(
        <Pagination
          page={1}
          pageSize={25}
          totalPages={4}
          total={100}
          onPageChange={vi.fn()}
          onPageSizeChange={onPageSizeChange}
        />,
      );

      const select = screen.getByRole('combobox');
      await user.selectOptions(select, '50');
      expect(onPageSizeChange).toHaveBeenCalledWith(50);
    });

    it('updates page count correctly for different page sizes', () => {
      renderWithProviders(
        <Pagination
          page={1}
          pageSize={50}
          totalPages={2}
          total={100}
          onPageChange={vi.fn()}
          onPageSizeChange={vi.fn()}
        />,
      );

      expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
    });
  });

  // ─── Scenario 1.3: Table is empty ───────────────────────────────────
  describe('Scenario 1.3: Table is empty (no certificates)', () => {
    it('shows empty state with import prompt when no certs and no search/filter', () => {
      renderWithProviders(
        <EmptyState hasFilters={false} hasSearch={false} />,
      );

      expect(screen.getByText('Nenhum certificado cadastrado')).toBeInTheDocument();
      expect(
        screen.getByText(/importe certificados para começar/i),
      ).toBeInTheDocument();
    });

    it('does not render table when data is empty', () => {
      renderWithProviders(
        <CertificateTable
          data={[]}
          isLoading={false}
          hasFilters={false}
          hasSearch={false}
        />,
      );

      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.getByText('Nenhum certificado cadastrado')).toBeInTheDocument();
    });

    it('shows "Limpar busca" button when search has no results', () => {
      const onClearSearch = vi.fn();

      renderWithProviders(
        <EmptyState
          hasFilters={false}
          hasSearch={true}
          onClearSearch={onClearSearch}
        />,
      );

      expect(screen.getByText('Nenhum resultado encontrado')).toBeInTheDocument();
      const clearBtn = screen.getByText('Limpar busca');
      expect(clearBtn).toBeInTheDocument();
    });
  });

  // ─── Scenario 1.4: Certificate details are accurate ──────────────────
  describe('Scenario 1.4: Certificate details are accurate in table row', () => {
    it('renders CN in the CnCell component', () => {
      renderWithProviders(
        <CnCell
          commonName="api-payments.internal"
          sans={['payments-v2', 'payments-canary']}
        />,
      );

      expect(screen.getByText('api-payments.internal')).toBeInTheDocument();
      expect(
        screen.getByText('+ 2 SANs: payments-v2, payments-canary'),
      ).toBeInTheDocument();
    });

    it('renders environment/zone in EnvTag', () => {
      renderWithProviders(
        <EnvTag zone="bank-prd" environment="PRD" />,
      );

      expect(screen.getByText(/bank-prd/)).toBeInTheDocument();
      expect(screen.getByText(/PRD/i)).toBeInTheDocument();
    });

    it('renders status badge correctly for VALID', () => {
      renderWithProviders(<Badge variant="ok">Válido</Badge>);
      expect(screen.getByText('Válido')).toBeInTheDocument();
    });

    it('renders days left correctly for 45 days', () => {
      renderWithProviders(<DaysLeft days={45} />);
      expect(screen.getByText('45 dias')).toBeInTheDocument();
    });

    it('renders days left as "Vencido" for expired certificates', () => {
      renderWithProviders(<DaysLeft days={-15} />);
      expect(screen.getByText('Vencido')).toBeInTheDocument();
    });

    it('renders "1 dia" for singular', () => {
      renderWithProviders(<DaysLeft days={1} />);
      expect(screen.getByText('1 dia')).toBeInTheDocument();
    });

    it('table row is clickable and calls onRowClick', async () => {
      const onRowClick = vi.fn();
      const cert = {
        ...createCertificate({ id: 'cert-xyz', commonName: 'api-payments.internal' }),
        daysUntilExpiry: 45,
      } as CertificateRow;

      renderWithProviders(
        <CertificateTable
          data={[cert]}
          isLoading={false}
          hasFilters={false}
          hasSearch={false}
          onRowClick={onRowClick}
        />,
      );

      const row = screen.getAllByRole('row')[1]; // first data row
      await user.click(row);
      expect(onRowClick).toHaveBeenCalledWith('cert-xyz');
    });
  });
});
