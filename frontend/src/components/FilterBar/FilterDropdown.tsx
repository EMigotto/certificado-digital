import { useState, useRef, useEffect } from 'react';
import styles from './FilterBar.module.css';

interface FilterDropdownProps {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}

export function FilterDropdown({ label, options, selected, onToggle }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const hasSelection = selected.length > 0;

  return (
    <div className={styles.dropdown} ref={ref}>
      <button
        className={`${styles.trigger} ${hasSelection ? styles.triggerActive : ''}`}
        onClick={() => setOpen(!open)}
        type="button"
      >
        <span>
          {label}
          {hasSelection && ` (${selected.length})`}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className={styles.menu}>
          {options.length === 0 && <div className={styles.empty}>Nenhuma opção</div>}
          {options.map((opt) => (
            <label key={opt} className={styles.option}>
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => onToggle(opt)}
                className={styles.checkbox}
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
