import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;

export interface UseSearchReturn {
  /** Current raw input value (shown in the field) */
  inputValue: string;
  /** Debounced search term (sent to API, '' if < MIN_CHARS) */
  searchTerm: string;
  /** Whether the search is being debounced */
  isDebouncing: boolean;
  /** Hint text (e.g. "mínimo 2 caracteres") */
  hint: string;
  /** Set the input value (called from onChange) */
  setInputValue: (value: string) => void;
  /** Clear the search entirely */
  clearSearch: () => void;
}

export function useSearch(): UseSearchReturn {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get('q') ?? '';

  const [inputValue, setInputValue] = useState(initialQ);
  const [searchTerm, setSearchTerm] = useState(initialQ.length >= MIN_CHARS ? initialQ : '');
  const [isDebouncing, setIsDebouncing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce input → searchTerm
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (inputValue.length === 0) {
      setSearchTerm('');
      setIsDebouncing(false);
      return;
    }

    if (inputValue.length < MIN_CHARS) {
      setSearchTerm('');
      setIsDebouncing(false);
      return;
    }

    setIsDebouncing(true);
    timerRef.current = setTimeout(() => {
      setSearchTerm(inputValue);
      setIsDebouncing(false);
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [inputValue]);

  // Sync searchTerm → URL
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (searchTerm) {
          next.set('q', searchTerm);
        } else {
          next.delete('q');
        }
        // Reset to page 1 on search change
        next.delete('page');
        return next;
      },
      { replace: true },
    );
  }, [searchTerm, setSearchParams]);

  const clearSearch = useCallback(() => {
    setInputValue('');
    setSearchTerm('');
  }, []);

  const hint =
    inputValue.length > 0 && inputValue.length < MIN_CHARS ? `Mínimo ${MIN_CHARS} caracteres` : '';

  return { inputValue, searchTerm, isDebouncing, hint, setInputValue, clearSearch };
}
