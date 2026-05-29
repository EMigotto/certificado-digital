import styles from './Badge.module.css';

export type BadgeVariant = 'ok' | 'warn' | 'crit' | 'rev' | 'pending' | 'issued' | 'renewed';

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
}

export function Badge({ variant, children }: BadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[variant]}`}>
      <span className={styles.dot} />
      {children}
    </span>
  );
}
