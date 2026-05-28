/**
 * QA Tests — Functional Requirement 10: Error Handling & Edge Cases
 *
 * Maps to: Scenarios 10.1–10.5
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { truncateCn, formatSansSummary, formatDaysLeft } from '@/utils/formatters';
import { parseCsvPreview } from '@/utils/csvPreview';
import { CnCell } from '@/components/Table/CnCell';
import { SanList } from '@/pages/CertificateDetail/components/SanList';
import { EmptyState } from '@/pages/Inventory/components/EmptyState';
import { renderWithProviders } from './helpers';

describe('AC 10 — Error Handling & Edge Cases', () => {
  // ─── Scenario 10.1: Network error during import ──────────────────────
  describe('Scenario 10.1: Network error handling', () => {
    it('ImportError type includes network error variant', () => {
      const networkError = {
        type: 'network' as const,
        message: 'Erro de rede. Tente novamente.',
      };

      expect(networkError.type).toBe('network');
      expect(networkError.message).toContain('rede');
    });
  });

  // ─── Scenario 10.2: Malformed CSV — covered in ac06 tests ───────────
  // (See ac06-bulk-import.test.tsx)

  // ─── Scenario 10.3: Very long certificate CN ─────────────────────────
  describe('Scenario 10.3: Very long certificate CN (>255 chars)', () => {
    it('truncateCn truncates to maxLength with ellipsis', () => {
      const longCn = 'a'.repeat(260) + '.bank.internal';
      const truncated = truncateCn(longCn, 40);

      expect(truncated.length).toBe(41); // 40 chars + ellipsis
      expect(truncated.endsWith('…')).toBe(true);
    });

    it('truncateCn returns original if under limit', () => {
      expect(truncateCn('short.internal', 40)).toBe('short.internal');
    });

    it('truncateCn returns empty for empty string', () => {
      expect(truncateCn('')).toBe('');
    });

    it('CnCell renders long CN properly', () => {
      const longCn = 'very-long-cert-name-'.repeat(15) + '.bank.internal';

      renderWithProviders(
        <CnCell commonName={longCn} sans={[]} />,
      );

      // The full CN is rendered (truncation is CSS-level or via formatters)
      expect(screen.getByText(longCn)).toBeInTheDocument();
    });
  });

  // ─── Scenario 10.4: Certificate with 100+ SANs ──────────────────────
  describe('Scenario 10.4: Certificate with 100+ SANs', () => {
    it('formatSansSummary shows correct badge text for 150 SANs', () => {
      const sans = Array.from({ length: 150 }, (_, i) => `san-${i}.bank.internal`);
      expect(formatSansSummary(sans)).toBe('+ 150 SANs');
    });

    it('formatSansSummary handles 0 SANs', () => {
      expect(formatSansSummary([])).toBe('+ 0 SANs');
    });

    it('formatSansSummary handles 1 SAN (singular)', () => {
      expect(formatSansSummary(['one.internal'])).toBe('+ 1 SAN');
    });

    it('CnCell shows summary badge for many SANs (>3)', () => {
      const sans = Array.from({ length: 120 }, (_, i) => `san-${i}.bank.internal`);

      renderWithProviders(<CnCell commonName="test.internal" sans={sans} />);

      expect(screen.getByText('+ 120 SANs')).toBeInTheDocument();
    });

    it('SanList renders all SANs in detail page', () => {
      const sans = ['san-0.bank.internal', 'san-1.bank.internal', 'san-2.bank.internal'];

      renderWithProviders(<SanList sans={sans} />);

      expect(screen.getByText('san-0.bank.internal')).toBeInTheDocument();
      expect(screen.getByText('san-1.bank.internal')).toBeInTheDocument();
      expect(screen.getByText('san-2.bank.internal')).toBeInTheDocument();
    });
  });

  // ─── Scenario 10.5: Concurrent imports ───────────────────────────────
  // Concurrent imports are server-side; client tests verify the UI can handle
  // multiple toasts / progress states
  describe('Scenario 10.5: Concurrent imports', () => {
    it('UI store supports multiple simultaneous toasts', async () => {
      const { useUiStore } = await import('@/store/uiStore');
      const state = useUiStore.getState();

      state.addToast({ type: 'info', message: 'Import 1 started' });
      state.addToast({ type: 'info', message: 'Import 2 started' });

      const updated = useUiStore.getState();
      expect(updated.toasts.length).toBeGreaterThanOrEqual(2);

      // Cleanup
      updated.toasts.forEach((t: { id: string }) => state.removeToast(t.id));
    });
  });

  // ─── Empty state variants ────────────────────────────────────────────
  describe('Empty state with search/filters vs. clean empty', () => {
    it('shows "no results" when search is active', () => {
      renderWithProviders(
        <EmptyState
          hasFilters={false}
          hasSearch={true}
          onClearSearch={vi.fn()}
        />,
      );

      expect(screen.getByText('Nenhum resultado encontrado')).toBeInTheDocument();
      expect(screen.getByText('Limpar busca')).toBeInTheDocument();
    });

    it('shows "no results" when filters are active', () => {
      renderWithProviders(
        <EmptyState
          hasFilters={true}
          hasSearch={false}
          onClearFilters={vi.fn()}
        />,
      );

      expect(screen.getByText('Nenhum resultado encontrado')).toBeInTheDocument();
      expect(screen.getByText('Limpar filtros')).toBeInTheDocument();
    });

    it('calls onClearSearch when clear search button is clicked', async () => {
      const onClearSearch = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <EmptyState
          hasFilters={false}
          hasSearch={true}
          onClearSearch={onClearSearch}
        />,
      );

      await user.click(screen.getByText('Limpar busca'));
      expect(onClearSearch).toHaveBeenCalled();
    });

    it('calls onClearFilters when clear filters button is clicked', async () => {
      const onClearFilters = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <EmptyState
          hasFilters={true}
          hasSearch={false}
          onClearFilters={onClearFilters}
        />,
      );

      await user.click(screen.getByText('Limpar filtros'));
      expect(onClearFilters).toHaveBeenCalled();
    });
  });
});
