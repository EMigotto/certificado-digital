import { useState, useRef, useEffect } from 'react';
import type { FilterKey, ActiveFilter } from '@/hooks/useFilters';
import { EXPIRATION_PRESETS } from '@/hooks/useFilters';
import { FilterChip } from '@/components/FilterChip/FilterChip';
import { FilterDropdown } from './FilterDropdown';
import type { FilterMeta } from '@/services/certificateApi';
import styles from './FilterBar.module.css';

interface FilterBarProps {
  activeFilters: ActiveFilter[];
  filterMeta: FilterMeta | undefined;
  filterParams: {
    expiresIn?: string;
    environment?: string[];
    ca?: string[];
    status?: string[];
    owner?: string;
    algorithm?: string[];
    tags?: string;
  };
  onToggleFilter: (key: FilterKey, value: string) => void;
  onRemoveFilter: (key: FilterKey, value: string) => void;
  onClearAll: () => void;
  isActive: (key: FilterKey, value: string) => boolean;
  hasFilters: boolean;
}

export function FilterBar({
  activeFilters,
  filterMeta,
  filterParams,
  onToggleFilter,
  onRemoveFilter,
  onClearAll,
  isActive,
  hasFilters,
}: FilterBarProps) {
  const [showMore, setShowMore] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showMore) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMore(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMore]);

  return (
    <div className={styles.bar}>
      {/* Active filter chips */}
      {activeFilters.map((f) => (
        <FilterChip
          key={`${f.key}:${f.value}`}
          label={f.label}
          onRemove={() => onRemoveFilter(f.key, f.value)}
        />
      ))}

      {/* + filtro button */}
      <div className={styles.addWrapper} ref={menuRef}>
        <button
          className={styles.addButton}
          onClick={() => setShowMore(!showMore)}
          type="button"
        >
          + filtro
        </button>

        {showMore && (
          <div className={styles.addMenu}>
            <div className={styles.addSection}>
              <div className={styles.addLabel}>Expiração</div>
              <div className={styles.presetRow}>
                {EXPIRATION_PRESETS.map((days) => (
                  <button
                    key={days}
                    className={`${styles.preset} ${isActive('expiresIn', days) ? styles.presetActive : ''}`}
                    onClick={() => onToggleFilter('expiresIn', days)}
                    type="button"
                  >
                    &lt; {days}d
                  </button>
                ))}
              </div>
            </div>

            {filterMeta && (
              <>
                <FilterDropdown
                  label="Ambiente"
                  options={filterMeta.environments}
                  selected={filterParams.environment ?? []}
                  onToggle={(v) => onToggleFilter('environment', v)}
                />
                <FilterDropdown
                  label="Status"
                  options={filterMeta.statuses}
                  selected={filterParams.status ?? []}
                  onToggle={(v) => onToggleFilter('status', v)}
                />
                <FilterDropdown
                  label="CA"
                  options={filterMeta.caProviders}
                  selected={filterParams.ca ?? []}
                  onToggle={(v) => onToggleFilter('ca', v)}
                />
                <FilterDropdown
                  label="Algoritmo"
                  options={filterMeta.algorithms}
                  selected={filterParams.algorithm ?? []}
                  onToggle={(v) => onToggleFilter('algorithm', v)}
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* Clear all */}
      {hasFilters && (
        <button className={styles.clearAll} onClick={onClearAll} type="button">
          Limpar filtros
        </button>
      )}
    </div>
  );
}
