import { useNavigate } from 'react-router-dom';
import styles from './Breadcrumb.module.css';

export interface BreadcrumbSegment {
  label: string;
  path?: string;
}

interface BreadcrumbProps {
  segments: BreadcrumbSegment[];
}

export function Breadcrumb({ segments }: BreadcrumbProps) {
  const navigate = useNavigate();

  return (
    <nav className={styles.breadcrumb} aria-label="Breadcrumb">
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        return (
          <span key={i}>
            {i > 0 && <span className={styles.sep}>›</span>}
            {isLast || !seg.path ? (
              <span className={isLast ? styles.current : undefined}>{seg.label}</span>
            ) : (
              <button
                className={styles.link}
                onClick={() => navigate(seg.path!)}
                type="button"
              >
                {seg.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
