import type { AuditAction, AuditResult } from '@certificado-digital/shared';
import styles from '../AuditLogPage.module.css';

export interface AuditFilterState {
  action: AuditAction | '';
  actor: string;
  certCn: string;
  dateFrom: string;
  dateTo: string;
  result: AuditResult | '';
}

interface AuditFiltersProps {
  filters: AuditFilterState;
  onChange: (update: Partial<AuditFilterState>) => void;
  onClear: () => void;
}

const ACTION_OPTIONS: { value: AuditAction | ''; label: string }[] = [
  { value: '', label: 'Todas ações' },
  { value: 'CREATE', label: 'IMPORT' },
  { value: 'UPDATE', label: 'UPDATE' },
  { value: 'DELETE', label: 'DELETE' },
  { value: 'REVOKE', label: 'REVOKE' },
];

const RESULT_OPTIONS: { value: AuditResult | ''; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'SUCCESS', label: 'SUCCESS' },
  { value: 'FAILURE', label: 'FAILURE' },
];

export function AuditFilters({ filters, onChange, onClear }: AuditFiltersProps) {
  const hasFilters =
    filters.action !== '' ||
    filters.actor !== '' ||
    filters.certCn !== '' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== '' ||
    filters.result !== '';

  return (
    <div className={styles.toolbar}>
      {/* CN search */}
      <div className={styles.search}>
        <svg width="14" height="14" viewBox="0 0 24 24" style={{ color: 'var(--text-mute)' }}>
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          placeholder="busca por CN…"
          value={filters.certCn}
          onChange={(e) => onChange({ certCn: e.target.value })}
          aria-label="Buscar por Common Name"
        />
      </div>

      {/* Actor search */}
      <div className={styles.search} style={{ maxWidth: '200px' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" style={{ color: 'var(--text-mute)' }}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <input
          placeholder="ator…"
          value={filters.actor}
          onChange={(e) => onChange({ actor: e.target.value })}
          aria-label="Buscar por ator"
        />
      </div>

      {/* Action type */}
      <select
        className={styles.filterSelect}
        value={filters.action}
        onChange={(e) => onChange({ action: e.target.value as AuditAction | '' })}
        aria-label="Filtrar por ação"
      >
        {ACTION_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Result */}
      <select
        className={styles.filterSelect}
        value={filters.result}
        onChange={(e) => onChange({ result: e.target.value as AuditResult | '' })}
        aria-label="Filtrar por resultado"
      >
        {RESULT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Date from */}
      <input
        className={styles.dateInput}
        type="date"
        value={filters.dateFrom}
        onChange={(e) => onChange({ dateFrom: e.target.value })}
        aria-label="Data início"
        placeholder="De"
      />

      {/* Date to */}
      <input
        className={styles.dateInput}
        type="date"
        value={filters.dateTo}
        onChange={(e) => onChange({ dateTo: e.target.value })}
        aria-label="Data fim"
        placeholder="Até"
      />

      {/* Clear filters */}
      {hasFilters && (
        <button
          className={`${styles.filter} ${styles.filterActive}`}
          onClick={onClear}
          type="button"
        >
          limpar filtros ×
        </button>
      )}
    </div>
  );
}
