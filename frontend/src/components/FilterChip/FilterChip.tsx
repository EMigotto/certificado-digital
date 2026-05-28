import styles from './FilterChip.module.css';

interface FilterChipProps {
  label: string;
  onRemove: () => void;
}

export function FilterChip({ label, onRemove }: FilterChipProps) {
  return (
    <button
      className={styles.chip}
      type="button"
      onClick={onRemove}
      aria-label={`Remover filtro ${label}`}
    >
      <span>{label}</span>
      <span className={styles.close}>×</span>
    </button>
  );
}
