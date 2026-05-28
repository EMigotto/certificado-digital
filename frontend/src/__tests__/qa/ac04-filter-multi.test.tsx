/**
 * QA Tests — Functional Requirement 4: Filter by Environment, CA, Status, Tags
 *
 * Maps to: Scenarios 4.1–4.7
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useFilters } from '@/hooks/useFilters';
import { renderWithProviders } from './helpers';

/** Harness that exercises multi-select filter functionality */
function MultiFilterHarness() {
  const {
    activeFilters,
    filterParams,
    toggleFilter,
    setFilter,
    removeFilter,
    clearAllFilters,
    isActive,
    hasFilters,
  } = useFilters();

  return (
    <div>
      {/* Environment filters */}
      <button onClick={() => toggleFilter('environment', 'PRD')} data-testid="env-prd">
        env: PRD
      </button>
      <button onClick={() => toggleFilter('environment', 'DEV')} data-testid="env-dev">
        env: DEV
      </button>
      <button onClick={() => toggleFilter('environment', 'HML')} data-testid="env-hml">
        env: HML
      </button>

      {/* CA filters */}
      <button onClick={() => toggleFilter('ca', 'Vault PKI')} data-testid="ca-vault">
        CA: Vault PKI
      </button>

      {/* Status filters */}
      <button onClick={() => toggleFilter('status', 'EXPIRED')} data-testid="status-expired">
        status: EXPIRED
      </button>
      <button onClick={() => toggleFilter('status', 'REVOKED')} data-testid="status-revoked">
        status: REVOKED
      </button>
      <button onClick={() => toggleFilter('status', 'EXPIRING_SOON')} data-testid="status-expiring">
        status: EXPIRING_SOON
      </button>

      {/* Tags */}
      <button onClick={() => toggleFilter('tags', 'mTLS')} data-testid="tag-mtls">
        tag: mTLS
      </button>

      {/* Expiration */}
      <button onClick={() => toggleFilter('expiresIn', '30')} data-testid="expires-30d">
        expira: &lt;30d
      </button>

      {/* Clear all */}
      <button onClick={() => clearAllFilters()} data-testid="clear-all">
        Clear all filters
      </button>

      {/* State display */}
      <div data-testid="has-filters">{String(hasFilters)}</div>
      <div data-testid="filter-params">{JSON.stringify(filterParams)}</div>
      <div data-testid="active-count">{activeFilters.length}</div>
      <div data-testid="active-labels">
        {activeFilters.map((f) => f.label).join(' | ')}
      </div>
      <div data-testid="is-env-prd">{String(isActive('environment', 'PRD'))}</div>
      <div data-testid="is-env-dev">{String(isActive('environment', 'DEV'))}</div>
      <div data-testid="is-env-hml">{String(isActive('environment', 'HML'))}</div>
    </div>
  );
}

describe('AC 4 — Filter by Environment, CA, Status, Tags', () => {
  const user = userEvent.setup();

  // ─── Scenario 4.1: Filter by single environment ───────────────────────
  describe('Scenario 4.1: Filter by environment (PRD)', () => {
    it('activates PRD filter and sets URL params', async () => {
      renderWithProviders(<MultiFilterHarness />, {
        initialEntries: ['/certificates'],
      });

      await user.click(screen.getByTestId('env-prd'));

      await waitFor(() => {
        const params = JSON.parse(screen.getByTestId('filter-params').textContent!);
        expect(params.environment).toEqual(['PRD']);
      });
    });
  });

  // ─── Scenario 4.2: Multi-select environment (OR logic) ────────────────
  describe('Scenario 4.2: Multi-select environment (DEV, HML)', () => {
    it('selects multiple environments with OR logic', async () => {
      renderWithProviders(<MultiFilterHarness />, {
        initialEntries: ['/certificates'],
      });

      await user.click(screen.getByTestId('env-dev'));
      await user.click(screen.getByTestId('env-hml'));

      await waitFor(() => {
        const params = JSON.parse(screen.getByTestId('filter-params').textContent!);
        expect(params.environment).toEqual(expect.arrayContaining(['DEV', 'HML']));
        expect(params.environment).not.toContain('PRD');
      });
    });

    it('generates separate filter chips for each environment value', async () => {
      renderWithProviders(<MultiFilterHarness />, {
        initialEntries: ['/certificates'],
      });

      await user.click(screen.getByTestId('env-dev'));
      await user.click(screen.getByTestId('env-hml'));

      await waitFor(() => {
        const labels = screen.getByTestId('active-labels').textContent!;
        expect(labels).toContain('env: DEV');
        expect(labels).toContain('env: HML');
      });
    });
  });

  // ─── Scenario 4.3: Filter by CA ──────────────────────────────────────
  describe('Scenario 4.3: Filter by CA (Vault PKI)', () => {
    it('activates CA filter', async () => {
      renderWithProviders(<MultiFilterHarness />, {
        initialEntries: ['/certificates'],
      });

      await user.click(screen.getByTestId('ca-vault'));

      await waitFor(() => {
        const params = JSON.parse(screen.getByTestId('filter-params').textContent!);
        expect(params.ca).toEqual(['Vault PKI']);
      });
    });
  });

  // ─── Scenario 4.4: Filter by Status (multiple) ────────────────────────
  describe('Scenario 4.4: Filter by Status (EXPIRED, REVOKED)', () => {
    it('selects multiple statuses', async () => {
      renderWithProviders(<MultiFilterHarness />, {
        initialEntries: ['/certificates'],
      });

      await user.click(screen.getByTestId('status-expired'));
      await user.click(screen.getByTestId('status-revoked'));

      await waitFor(() => {
        const params = JSON.parse(screen.getByTestId('filter-params').textContent!);
        expect(params.status).toEqual(expect.arrayContaining(['EXPIRED', 'REVOKED']));
      });
    });
  });

  // ─── Scenario 4.5: Filter by tags ─────────────────────────────────────
  describe('Scenario 4.5: Filter by custom tags', () => {
    it('activates tag filter', async () => {
      renderWithProviders(<MultiFilterHarness />, {
        initialEntries: ['/certificates'],
      });

      await user.click(screen.getByTestId('tag-mtls'));

      await waitFor(() => {
        const params = JSON.parse(screen.getByTestId('filter-params').textContent!);
        expect(params.tags).toBe('mTLS');
      });
    });
  });

  // ─── Scenario 4.6: Combine multiple filters (AND across groups) ──────
  describe('Scenario 4.6: Combine 4 filters across different groups', () => {
    it('activates all 4 filters simultaneously', async () => {
      renderWithProviders(<MultiFilterHarness />, {
        initialEntries: ['/certificates'],
      });

      await user.click(screen.getByTestId('expires-30d'));
      await user.click(screen.getByTestId('env-prd'));
      await user.click(screen.getByTestId('ca-vault'));
      await user.click(screen.getByTestId('status-expiring'));

      await waitFor(() => {
        const params = JSON.parse(screen.getByTestId('filter-params').textContent!);
        expect(params.expiresIn).toBe('30');
        expect(params.environment).toEqual(['PRD']);
        expect(params.ca).toEqual(['Vault PKI']);
        expect(params.status).toEqual(['EXPIRING_SOON']);
      });
    });

    it('shows 4 active filter chips', async () => {
      renderWithProviders(<MultiFilterHarness />, {
        initialEntries: ['/certificates'],
      });

      await user.click(screen.getByTestId('expires-30d'));
      await user.click(screen.getByTestId('env-prd'));
      await user.click(screen.getByTestId('ca-vault'));
      await user.click(screen.getByTestId('status-expiring'));

      await waitFor(() => {
        expect(screen.getByTestId('active-count').textContent).toBe('4');
      });
    });
  });

  // ─── Scenario 4.7: Clear all filters ──────────────────────────────────
  describe('Scenario 4.7: Clear all filters', () => {
    it('removes all filters when "Clear all" is clicked', async () => {
      renderWithProviders(<MultiFilterHarness />, {
        initialEntries: ['/certificates'],
      });

      // Apply 3 filters
      await user.click(screen.getByTestId('env-prd'));
      await user.click(screen.getByTestId('ca-vault'));
      await user.click(screen.getByTestId('expires-30d'));

      await waitFor(() => {
        expect(screen.getByTestId('active-count').textContent).toBe('3');
      });

      // Clear all
      await user.click(screen.getByTestId('clear-all'));

      await waitFor(() => {
        expect(screen.getByTestId('has-filters').textContent).toBe('false');
        expect(screen.getByTestId('active-count').textContent).toBe('0');
      });
    });

    it('resets filterParams to empty object after clearing', async () => {
      renderWithProviders(<MultiFilterHarness />, {
        initialEntries: ['/certificates'],
      });

      await user.click(screen.getByTestId('env-prd'));
      await user.click(screen.getByTestId('clear-all'));

      await waitFor(() => {
        const params = JSON.parse(screen.getByTestId('filter-params').textContent!);
        expect(Object.keys(params)).toHaveLength(0);
      });
    });
  });
});
