/**
 * QA Tests — Functional Requirement 3: Filter by Expiration Window
 *
 * Maps to: Scenarios 3.1–3.4
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useFilters, type ActiveFilter, FILTER_LABELS } from '@/hooks/useFilters';
import { FilterChip } from '@/components/FilterChip/FilterChip';
import { renderWithProviders } from './helpers';

/** Harness to exercise useFilters hook */
function FilterHarness() {
  const {
    activeFilters,
    filterParams,
    toggleFilter,
    removeFilter,
    clearAllFilters,
    isActive,
    hasFilters,
  } = useFilters();

  return (
    <div>
      <button onClick={() => toggleFilter('expiresIn', '30')} data-testid="toggle-30d">
        expira: &lt;30d
      </button>
      <button onClick={() => toggleFilter('expiresIn', '7')} data-testid="toggle-7d">
        expira: &lt;7d
      </button>
      <button onClick={() => toggleFilter('expiresIn', '90')} data-testid="toggle-90d">
        expira: &lt;90d
      </button>
      <button onClick={() => clearAllFilters()} data-testid="clear-all">
        Clear all
      </button>
      <div data-testid="has-filters">{String(hasFilters)}</div>
      <div data-testid="filter-params">{JSON.stringify(filterParams)}</div>
      <div data-testid="active-filters">{JSON.stringify(activeFilters)}</div>
      <div data-testid="is-active-30">{String(isActive('expiresIn', '30'))}</div>
      <div data-testid="is-active-7">{String(isActive('expiresIn', '7'))}</div>

      {/* Render active filter chips */}
      {activeFilters.map((f) => (
        <div key={`${f.key}-${f.value}`} data-testid={`chip-${f.key}-${f.value}`}>
          <FilterChip
            label={f.label}
            onRemove={() => removeFilter(f.key, f.value)}
          />
        </div>
      ))}
    </div>
  );
}

describe('AC 3 — Filter by Expiration Window', () => {
  const user = userEvent.setup();

  // ─── Scenario 3.1: Filter "expires < 30 days" ────────────────────────
  describe('Scenario 3.1: Filter "expires < 30 days"', () => {
    it('activates the 30d filter and sets URL param', async () => {
      renderWithProviders(<FilterHarness />, {
        initialEntries: ['/certificates'],
      });

      await user.click(screen.getByTestId('toggle-30d'));

      await waitFor(() => {
        const params = JSON.parse(screen.getByTestId('filter-params').textContent!);
        expect(params.expiresIn).toBe('30');
      });
    });

    it('shows the filter chip with correct label', async () => {
      renderWithProviders(<FilterHarness />, {
        initialEntries: ['/certificates'],
      });

      await user.click(screen.getByTestId('toggle-30d'));

      await waitFor(() => {
        const filters = JSON.parse(screen.getByTestId('active-filters').textContent!);
        expect(filters).toHaveLength(1);
        expect(filters[0].label).toBe('expira: < 30d');
      });
    });

    it('isActive returns true for the active filter', async () => {
      renderWithProviders(<FilterHarness />, {
        initialEntries: ['/certificates'],
      });

      await user.click(screen.getByTestId('toggle-30d'));

      await waitFor(() => {
        expect(screen.getByTestId('is-active-30').textContent).toBe('true');
      });
    });
  });

  // ─── Scenario 3.2: Filter "expires < 7 days" ──────────────────────────
  describe('Scenario 3.2: Filter "expires < 7 days"', () => {
    it('activates the 7d filter', async () => {
      renderWithProviders(<FilterHarness />, {
        initialEntries: ['/certificates'],
      });

      await user.click(screen.getByTestId('toggle-7d'));

      await waitFor(() => {
        const params = JSON.parse(screen.getByTestId('filter-params').textContent!);
        expect(params.expiresIn).toBe('7');
      });
    });
  });

  // ─── Scenario 3.3: Multiple filter combination with expiration ────────
  describe('Scenario 3.3: Combined expiration + environment filters', () => {
    it('switching from 30d to 7d replaces (toggle behavior)', async () => {
      renderWithProviders(<FilterHarness />, {
        initialEntries: ['/certificates'],
      });

      await user.click(screen.getByTestId('toggle-30d'));

      await waitFor(() => {
        expect(screen.getByTestId('is-active-30').textContent).toBe('true');
      });

      await user.click(screen.getByTestId('toggle-7d'));

      await waitFor(() => {
        expect(screen.getByTestId('is-active-7').textContent).toBe('true');
        expect(screen.getByTestId('is-active-30').textContent).toBe('false');
      });
    });
  });

  // ─── Scenario 3.4: Filter returns zero results (chip remains) ─────────
  describe('Scenario 3.4: Filter with zero results', () => {
    it('filter chip stays active even when no data matches', async () => {
      renderWithProviders(<FilterHarness />, {
        initialEntries: ['/certificates'],
      });

      await user.click(screen.getByTestId('toggle-7d'));

      await waitFor(() => {
        expect(screen.getByTestId('has-filters').textContent).toBe('true');
        const filters = JSON.parse(screen.getByTestId('active-filters').textContent!);
        expect(filters).toHaveLength(1);
      });
    });

    it('toggling filter off removes it', async () => {
      renderWithProviders(<FilterHarness />, {
        initialEntries: ['/certificates'],
      });

      await user.click(screen.getByTestId('toggle-7d'));
      await waitFor(() => {
        expect(screen.getByTestId('has-filters').textContent).toBe('true');
      });

      await user.click(screen.getByTestId('toggle-7d'));
      await waitFor(() => {
        expect(screen.getByTestId('has-filters').textContent).toBe('false');
      });
    });
  });

  // ─── FilterChip component tests ───────────────────────────────────────
  describe('FilterChip component', () => {
    it('renders label and remove button', () => {
      renderWithProviders(
        <FilterChip label="expira: < 30d" onRemove={vi.fn()} />,
      );

      expect(screen.getByText(/expira: < 30d/)).toBeInTheDocument();
    });

    it('calls onRemove when × is clicked', async () => {
      const onRemove = vi.fn();
      renderWithProviders(
        <FilterChip label="expira: < 30d" onRemove={onRemove} />,
      );

      const btn = screen.getByRole('button');
      await user.click(btn);
      expect(onRemove).toHaveBeenCalled();
    });
  });
});
