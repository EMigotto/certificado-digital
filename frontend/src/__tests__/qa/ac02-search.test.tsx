/**
 * QA Tests — Functional Requirement 2: Search Certificates by Multiple Fields
 *
 * Maps to: Scenarios 2.1–2.7
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchInput } from '@/components/SearchInput/SearchInput';
import { useSearch } from '@/hooks/useSearch';
import { renderWithProviders } from './helpers';

/** Simple wrapper that exposes the useSearch hook's state. */
function SearchHarness() {
  const { inputValue, searchTerm, hint, setInputValue, clearSearch, isDebouncing } = useSearch();
  return (
    <div>
      <SearchInput
        value={inputValue}
        onChange={setInputValue}
        onClear={clearSearch}
        hint={hint}
      />
      <div data-testid="search-term">{searchTerm}</div>
      <div data-testid="hint">{hint}</div>
      <div data-testid="debouncing">{String(isDebouncing)}</div>
    </div>
  );
}

describe('AC 2 — Search Certificates by Multiple Fields', () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Scenario 2.1: Search by Common Name ────────────────────────────
  describe('Scenario 2.1: Search by CN (debounce + filter)', () => {
    it('debounces input and sets searchTerm after 300ms when >=2 chars', async () => {
      renderWithProviders(<SearchHarness />, {
        initialEntries: ['/certificates'],
      });

      const input = screen.getByRole('textbox');
      await user.type(input, 'api-pay');

      // Before debounce, searchTerm should be empty
      expect(screen.getByTestId('search-term').textContent).toBe('');

      // Advance timers to trigger debounce
      act(() => {
        vi.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(screen.getByTestId('search-term').textContent).toBe('api-pay');
      });
    });
  });

  // ─── Scenario 2.5: Search returns no results ────────────────────────
  describe('Scenario 2.5: Search returns no results', () => {
    it('shows clear button when text entered and clears on click', async () => {
      const onChange = vi.fn();
      const onClear = vi.fn();

      renderWithProviders(
        <SearchInput value="nonexistent-cert" onChange={onChange} onClear={onClear} />,
      );

      const clearBtn = screen.getByRole('button', { name: /limpar busca/i });
      expect(clearBtn).toBeInTheDocument();

      await user.click(clearBtn);
      expect(onClear).toHaveBeenCalled();
    });
  });

  // ─── Scenario 2.6: Search with less than 2 characters ──────────────
  describe('Scenario 2.6: Search with <2 characters', () => {
    it('shows hint and does not trigger search when input has 1 character', async () => {
      renderWithProviders(<SearchHarness />, {
        initialEntries: ['/certificates'],
      });

      const input = screen.getByRole('textbox');
      await user.type(input, 'a');

      act(() => {
        vi.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(screen.getByTestId('hint').textContent).toBe('Mínimo 2 caracteres');
        expect(screen.getByTestId('search-term').textContent).toBe('');
      });
    });

    it('shows no hint when input is empty', () => {
      renderWithProviders(<SearchHarness />, {
        initialEntries: ['/certificates'],
      });

      expect(screen.getByTestId('hint').textContent).toBe('');
    });
  });

  // ─── Scenario 2.7: Case-insensitive search ─────────────────────────
  describe('Scenario 2.7: Case-insensitive search', () => {
    it('search term is passed to API as-is (server does case-insensitive)', async () => {
      renderWithProviders(<SearchHarness />, {
        initialEntries: ['/certificates'],
      });

      const input = screen.getByRole('textbox');
      await user.type(input, 'api-payments');

      act(() => {
        vi.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(screen.getByTestId('search-term').textContent).toBe('api-payments');
      });
    });
  });

  // ─── Scenario 2.2/2.3/2.4: Search by SAN/Serial/Owner ─────────────
  // These are server-side behaviors; we verify the search term gets passed correctly
  describe('Scenario 2.2–2.4: Search term reaches API layer', () => {
    it('passes any typed term to the search hook after debounce', async () => {
      renderWithProviders(<SearchHarness />, {
        initialEntries: ['/certificates'],
      });

      const input = screen.getByRole('textbox');
      await user.type(input, '1A2B3C');

      act(() => {
        vi.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(screen.getByTestId('search-term').textContent).toBe('1A2B3C');
      });
    });
  });

  // ─── SearchInput isolation tests ─────────────────────────────────────
  describe('SearchInput component', () => {
    it('renders placeholder text', () => {
      renderWithProviders(
        <SearchInput
          value=""
          onChange={vi.fn()}
          onClear={vi.fn()}
          placeholder="busca: CN, SAN, serial, owner..."
        />,
      );

      expect(
        screen.getByPlaceholderText('busca: CN, SAN, serial, owner...'),
      ).toBeInTheDocument();
    });

    it('does not show clear button when value is empty', () => {
      renderWithProviders(
        <SearchInput value="" onChange={vi.fn()} onClear={vi.fn()} />,
      );

      expect(screen.queryByRole('button', { name: /limpar busca/i })).not.toBeInTheDocument();
    });

    it('shows hint text when provided', () => {
      renderWithProviders(
        <SearchInput
          value="a"
          onChange={vi.fn()}
          onClear={vi.fn()}
          hint="Mínimo 2 caracteres"
        />,
      );

      expect(screen.getByText('Mínimo 2 caracteres')).toBeInTheDocument();
    });

    it('calls onChange when typing', async () => {
      const onChange = vi.fn();
      renderWithProviders(
        <SearchInput value="" onChange={onChange} onClear={vi.fn()} />,
      );

      const input = screen.getByRole('textbox');
      await user.type(input, 'x');
      expect(onChange).toHaveBeenCalled();
    });
  });
});
