import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/** All available filter keys */
export type FilterKey =
  | 'expiresIn'
  | 'environment'
  | 'ca'
  | 'status'
  | 'owner'
  | 'algorithm'
  | 'tags';

/** Expiration preset values */
export const EXPIRATION_PRESETS = ['7', '30', '90'] as const;

/** Human-readable labels for filter chips */
export const FILTER_LABELS: Record<FilterKey, string> = {
  expiresIn: 'expira',
  environment: 'env',
  ca: 'CA',
  status: 'status',
  owner: 'owner',
  algorithm: 'algoritmo',
  tags: 'tags',
};

export interface ActiveFilter {
  key: FilterKey;
  value: string;
  label: string;
}

export interface UseFiltersReturn {
  /** All currently active filters as chips */
  activeFilters: ActiveFilter[];
  /** Raw filter values for API call */
  filterParams: {
    expiresIn?: string;
    environment?: string[];
    ca?: string[];
    status?: string[];
    owner?: string;
    algorithm?: string[];
    tags?: string;
  };
  /** Toggle a filter value (add or remove) */
  toggleFilter: (key: FilterKey, value: string) => void;
  /** Set a filter to exactly these values (replaces) */
  setFilter: (key: FilterKey, values: string[]) => void;
  /** Remove a specific filter value */
  removeFilter: (key: FilterKey, value: string) => void;
  /** Clear all filters */
  clearAllFilters: () => void;
  /** Check if a specific filter value is active */
  isActive: (key: FilterKey, value: string) => boolean;
  /** Whether any filters are active */
  hasFilters: boolean;
}

/** Filter keys that accept multiple comma-separated values */
const MULTI_KEYS: FilterKey[] = ['environment', 'ca', 'status', 'algorithm'];

function parseMulti(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function useFilters(): UseFiltersReturn {
  const [searchParams, setSearchParams] = useSearchParams();

  const filterParams = useMemo(() => {
    const result: UseFiltersReturn['filterParams'] = {};
    const expiresIn = searchParams.get('expiresIn');
    if (expiresIn) result.expiresIn = expiresIn;

    const env = parseMulti(searchParams.get('environment'));
    if (env.length) result.environment = env;

    const ca = parseMulti(searchParams.get('ca'));
    if (ca.length) result.ca = ca;

    const status = parseMulti(searchParams.get('status'));
    if (status.length) result.status = status;

    const owner = searchParams.get('owner');
    if (owner) result.owner = owner;

    const algo = parseMulti(searchParams.get('algorithm'));
    if (algo.length) result.algorithm = algo;

    const tags = searchParams.get('tags');
    if (tags) result.tags = tags;

    return result;
  }, [searchParams]);

  const activeFilters = useMemo(() => {
    const chips: ActiveFilter[] = [];

    if (filterParams.expiresIn) {
      chips.push({
        key: 'expiresIn',
        value: filterParams.expiresIn,
        label: `${FILTER_LABELS.expiresIn}: < ${filterParams.expiresIn}d`,
      });
    }

    for (const key of MULTI_KEYS) {
      const values = filterParams[key] as string[] | undefined;
      if (values) {
        for (const v of values) {
          chips.push({
            key,
            value: v,
            label: `${FILTER_LABELS[key]}: ${v}`,
          });
        }
      }
    }

    if (filterParams.owner) {
      chips.push({
        key: 'owner',
        value: filterParams.owner,
        label: `${FILTER_LABELS.owner}: ${filterParams.owner}`,
      });
    }

    if (filterParams.tags) {
      chips.push({
        key: 'tags',
        value: filterParams.tags,
        label: `${FILTER_LABELS.tags}: ${filterParams.tags}`,
      });
    }

    return chips;
  }, [filterParams]);

  const updateParams = useCallback(
    (updater: (params: URLSearchParams) => URLSearchParams) => {
      setSearchParams(
        (prev) => {
          const next = updater(new URLSearchParams(prev));
          // Reset page on filter change
          next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const toggleFilter = useCallback(
    (key: FilterKey, value: string) => {
      updateParams((params) => {
        if (key === 'expiresIn') {
          if (params.get('expiresIn') === value) {
            params.delete('expiresIn');
          } else {
            params.set('expiresIn', value);
          }
          return params;
        }

        if (key === 'owner') {
          if (params.get('owner') === value) {
            params.delete('owner');
          } else {
            params.set('owner', value);
          }
          return params;
        }

        if (MULTI_KEYS.includes(key)) {
          const current = parseMulti(params.get(key));
          const idx = current.indexOf(value);
          if (idx >= 0) {
            current.splice(idx, 1);
          } else {
            current.push(value);
          }
          if (current.length) {
            params.set(key, current.join(','));
          } else {
            params.delete(key);
          }
          return params;
        }

        // tags
        if (params.get(key) === value) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
        return params;
      });
    },
    [updateParams],
  );

  const setFilter = useCallback(
    (key: FilterKey, values: string[]) => {
      updateParams((params) => {
        if (values.length === 0) {
          params.delete(key);
        } else if (MULTI_KEYS.includes(key)) {
          params.set(key, values.join(','));
        } else {
          params.set(key, values[0]);
        }
        return params;
      });
    },
    [updateParams],
  );

  const removeFilter = useCallback(
    (key: FilterKey, value: string) => {
      updateParams((params) => {
        if (MULTI_KEYS.includes(key)) {
          const current = parseMulti(params.get(key));
          const filtered = current.filter((v) => v !== value);
          if (filtered.length) {
            params.set(key, filtered.join(','));
          } else {
            params.delete(key);
          }
        } else {
          params.delete(key);
        }
        return params;
      });
    },
    [updateParams],
  );

  const clearAllFilters = useCallback(() => {
    updateParams((params) => {
      const filterKeys: FilterKey[] = [
        'expiresIn',
        'environment',
        'ca',
        'status',
        'owner',
        'algorithm',
        'tags',
      ];
      for (const k of filterKeys) {
        params.delete(k);
      }
      return params;
    });
  }, [updateParams]);

  const isActive = useCallback(
    (key: FilterKey, value: string): boolean => {
      if (key === 'expiresIn' || key === 'owner' || key === 'tags') {
        return searchParams.get(key) === value;
      }
      return parseMulti(searchParams.get(key)).includes(value);
    },
    [searchParams],
  );

  const hasFilters = activeFilters.length > 0;

  return {
    activeFilters,
    filterParams,
    toggleFilter,
    setFilter,
    removeFilter,
    clearAllFilters,
    isActive,
    hasFilters,
  };
}
