/**
 * ValidationPreview — row-level validation table for CSV import.
 *
 * Uses the shared Badge component from the design system.
 */

import { Badge } from '@/components/Badge/Badge';
import type { CsvPreviewRow } from '@/services/certificateApi';
import type { CsvRowResult } from '@/utils/csvPreview';
import styles from '../BulkImportPage.module.css';

type PreviewRow = CsvPreviewRow | CsvRowResult;

interface ValidationPreviewProps {
  rows: PreviewRow[];
  validCount: number;
  errorCount: number;
  duplicateCount: number;
}

export function ValidationPreview({
  rows,
  validCount,
  errorCount,
  duplicateCount,
}: ValidationPreviewProps) {
  const getCn = (row: PreviewRow): string =>
    (row.data as { cn?: string }).cn ?? '';

  const getIssuer = (row: PreviewRow): string =>
    (row.data as { issuer?: string }).issuer ?? '';

  const getEnvironment = (row: PreviewRow): string =>
    (row.data as { environment?: string }).environment ?? '';

  const getOwner = (row: PreviewRow): string =>
    (row.data as { owner?: string }).owner ?? '';

  return (
    <div className={styles.previewPanel}>
      <div className={styles.previewHead}>
        <div className={styles.previewTitle}>Validação das linhas</div>
        <div className={styles.previewStats}>
          <span className={styles.statOk}>✓ {validCount} válidas</span>
          {errorCount > 0 && <span className={styles.statErr}>✗ {errorCount} com erros</span>}
          {duplicateCount > 0 && (
            <span className={styles.statDup}>⚠ {duplicateCount} duplicadas</span>
          )}
        </div>
      </div>

      <table className={styles.previewTable}>
        <thead>
          <tr>
            <th style={{ width: 60 }}>Linha</th>
            <th>Status</th>
            <th>Common Name</th>
            <th>Issuer</th>
            <th>Owner</th>
            <th>Env</th>
            <th>Erros</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.row}>
              <td>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)' }}>
                  {row.row}
                </span>
              </td>
              <td>
                <StatusBadge status={row.status} />
              </td>
              <td>
                <span className={styles.cnCell}>{getCn(row) || '—'}</span>
              </td>
              <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)' }}>
                {getIssuer(row) || '—'}
              </td>
              <td style={{ fontSize: 13 }}>{getOwner(row) || '—'}</td>
              <td>
                {getEnvironment(row) ? (
                  <span
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 10,
                      padding: '2px 6px',
                      borderRadius: 3,
                      background: 'var(--surface-2)',
                      color: 'var(--text-dim)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {getEnvironment(row)}
                  </span>
                ) : (
                  '—'
                )}
              </td>
              <td>
                {row.errors.length > 0 ? (
                  <ul className={styles.errorList}>
                    {row.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                ) : (
                  <span style={{ color: 'var(--text-mute)' }}>—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'valid':
      return <Badge variant="ok">Válida</Badge>;
    case 'error':
      return <Badge variant="crit">Erro</Badge>;
    case 'duplicate':
      return <Badge variant="warn">Duplicada</Badge>;
    default:
      return null;
  }
}
