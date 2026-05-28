/**
 * MetadataPreview — shows parsed certificate info before confirm.
 *
 * Displays CN, SANs, issuer, validity dates, algorithm, serial
 * in the prototype's info-grid layout.
 */

import type { CertPreview } from '@/utils/certParser';
import styles from '../UploadPage.module.css';

interface MetadataPreviewProps {
  preview: CertPreview;
}

export function MetadataPreview({ preview }: MetadataPreviewProps) {
  if (!preview.parsed && preview.message) {
    return (
      <div className={styles.policyNote}>
        <svg width="16" height="16" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
        <div>{preview.message}</div>
      </div>
    );
  }

  if (!preview.parsed) return null;

  const formatDate = (iso: string): string => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className={styles.metaPanel}>
      <div className={styles.metaTitle}>
        <svg className={styles.metaTitleIcon} width="18" height="18" viewBox="0 0 24 24">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
        Metadados do certificado
      </div>

      <div className={styles.infoGrid}>
        <div className={styles.infoItem}>
          <div className={styles.infoLabel}>Common Name</div>
          <div className={styles.infoValue}>{preview.commonName || '—'}</div>
        </div>
        <div className={styles.infoItem}>
          <div className={styles.infoLabel}>SANs</div>
          <div className={styles.infoValue}>
            {preview.sans.length > 0 ? preview.sans.join(', ') : 'Nenhum'}
          </div>
        </div>
        <div className={styles.infoItem}>
          <div className={styles.infoLabel}>Emissor (Issuer)</div>
          <div className={styles.infoValue}>{preview.issuer || '—'}</div>
        </div>
        <div className={styles.infoItem}>
          <div className={styles.infoLabel}>Algoritmo</div>
          <div className={styles.infoValue}>{preview.algorithm || '—'}</div>
        </div>
        <div className={styles.infoItem}>
          <div className={styles.infoLabel}>Válido a partir de</div>
          <div className={styles.infoValue}>{formatDate(preview.notBefore)}</div>
        </div>
        <div className={styles.infoItem}>
          <div className={styles.infoLabel}>Válido até</div>
          <div className={styles.infoValue}>{formatDate(preview.notAfter)}</div>
        </div>
        <div className={styles.infoItem}>
          <div className={styles.infoLabel}>Serial</div>
          <div className={styles.infoValue}>{preview.serial || '—'}</div>
        </div>
        <div className={styles.infoItem}>
          <div className={styles.infoLabel}>Formato</div>
          <div className={styles.infoValue}>{preview.format}</div>
        </div>
      </div>
    </div>
  );
}
