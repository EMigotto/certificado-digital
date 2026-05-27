import styles from './SearchInput.module.css';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  hint?: string;
  placeholder?: string;
}

export function SearchInput({
  value,
  onChange,
  onClear,
  hint,
  placeholder = 'busca: CN, SAN, serial, owner...',
}: SearchInputProps) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.search}>
        <svg width="14" height="14" viewBox="0 0 24 24" className={styles.icon}>
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          className={styles.input}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Buscar certificados"
        />
        {value.length > 0 && (
          <button
            className={styles.clear}
            onClick={onClear}
            aria-label="Limpar busca"
            type="button"
          >
            ×
          </button>
        )}
      </div>
      {hint && <div className={styles.hint}>{hint}</div>}
    </div>
  );
}
