import { CopyButton } from '@/components/CopyButton/CopyButton';
import styles from './MetadataGrid.module.css';

interface InfoItemProps {
  label: string;
  value: string;
  /** Show copy button */
  copyable?: boolean;
  /** Use sans-serif font for value */
  sans?: boolean;
  /** Truncate long values with expand on hover */
  truncate?: boolean;
  /** Color variant for the value */
  colorClass?: string;
}

export function InfoItem({
  label,
  value,
  copyable = false,
  sans = false,
  truncate = false,
  colorClass,
}: InfoItemProps) {
  return (
    <div className={styles.infoItem}>
      <div className={styles.infoLabel}>{label}</div>
      <div
        className={`${styles.infoValue} ${sans ? styles.sans : ''} ${truncate ? styles.truncated : ''} ${colorClass ?? ''}`}
        title={truncate ? value : undefined}
      >
        <span>{value}</span>
        {copyable && <CopyButton value={value} label={label} />}
      </div>
    </div>
  );
}
