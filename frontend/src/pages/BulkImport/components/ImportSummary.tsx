/**
 * ImportSummary — results after CSV import execution.
 *
 * Uses the shared Button component from the design system.
 */

import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/Button/Button';
import type { CsvImportSummary, CsvPreviewRow } from '@/services/certificateApi';
import { generateFailedRowsCsv } from '@/utils/csvPreview';
import styles from '../BulkImportPage.module.css';

interface ImportSummaryProps {
  summary: CsvImportSummary;
}

export function ImportSummary({ summary }: ImportSummaryProps) {
  const handleDownloadFailed = useCallback(() => {
    if (summary.failedRows.length === 0) return;

    const rows = summary.failedRows.map((r: CsvPreviewRow) => ({
      row: r.row,
      data: r.data as unknown as Record<string, unknown>,
      errors: r.errors,
    }));

    const csv = generateFailedRowsCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import_failed_${summary.batchId}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [summary]);

  return (
    <div className={styles.summaryPanel}>
      <div className={styles.summaryTitle}>
        {summary.imported > 0 ? (
          <svg className={styles.summaryTitleIcon} width="24" height="24" viewBox="0 0 24 24">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" style={{ color: 'var(--crit)' }}>
            <circle cx="12" cy="12" r="10" />
            <path d="M15 9l-6 6M9 9l6 6" />
          </svg>
        )}
        Resultado da importação
      </div>

      <div className={styles.summaryGrid}>
        <div className={`${styles.summaryCard} ${styles.summaryCardOk}`}>
          <div className={styles.summaryCardLabel}>Importados</div>
          <div className={styles.summaryCardValue} style={{ color: 'var(--ok)' }}>
            {summary.imported}
          </div>
        </div>

        <div className={`${styles.summaryCard} ${styles.summaryCardErr}`}>
          <div className={styles.summaryCardLabel}>Falharam</div>
          <div
            className={styles.summaryCardValue}
            style={{ color: summary.failed > 0 ? 'var(--crit)' : 'var(--text)' }}
          >
            {summary.failed}
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={styles.summaryCardLabel}>Batch ID</div>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 12,
              color: 'var(--text-dim)',
              wordBreak: 'break-all',
              marginTop: 8,
            }}
          >
            {summary.batchId}
          </div>
        </div>
      </div>

      <div className={styles.summaryActions}>
        {summary.failedRows.length > 0 && (
          <Button variant="danger" onClick={handleDownloadFailed}>
            <svg width="14" height="14" viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download linhas com falha
          </Button>
        )}
        <div className={styles.spacer} />
        <Link to="/audit">
          <Button variant="secondary">Ver Audit Log</Button>
        </Link>
        <Link to="/certificates">
          <Button variant="primary">Ir para inventário</Button>
        </Link>
      </div>
    </div>
  );
}
