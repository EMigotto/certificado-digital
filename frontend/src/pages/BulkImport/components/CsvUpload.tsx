/**
 * CsvUpload — CSV file picker with template download link.
 */

import { useCallback, useRef, useState } from 'react';
import { downloadCsvTemplate } from '@/services/certificateApi';
import styles from '../BulkImportPage.module.css';

interface CsvUploadProps {
  file: File | null;
  onFileSelect: (file: File) => void;
  onFileRemove: () => void;
  disabled?: boolean;
}

export function CsvUpload({ file, onFileSelect, onFileRemove, disabled }: CsvUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) setDragActive(true);
    },
    [disabled],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (disabled) return;
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) onFileSelect(droppedFile);
    },
    [disabled, onFileSelect],
  );

  const handleClick = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) onFileSelect(selectedFile);
      e.target.value = '';
    },
    [onFileSelect],
  );

  const handleDownloadTemplate = useCallback(async () => {
    try {
      const blob = await downloadCsvTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'certificate_import_template.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: generate template locally
      const headers =
        'cn,sans,serial,issuer,not_before,not_after,algorithm,fingerprint_sha256,owner,application,environment,zone,ca_provider,description,tags';
      const example =
        'api.example.com,api.example.com;www.example.com,AA:BB:CC,CN=Example CA,2024-01-01T00:00:00Z,2025-01-01T00:00:00Z,RSA-2048,,team-platform,api-gateway,prd,us-east-1,DigiCert,Production cert,team:platform';
      const blob = new Blob([`${headers}\n${example}\n`], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'certificate_import_template.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, []);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className={styles.uploadPanel}>
      <div className={styles.panelTitle}>
        <svg className={styles.panelTitleIcon} width="18" height="18" viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
        </svg>
        Arquivo CSV
      </div>

      {file ? (
        <div className={styles.fileSelected}>
          <svg className={styles.fileIcon} width="24" height="24" viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
          </svg>
          <div className={styles.fileInfo}>
            <div className={styles.fileName}>{file.name}</div>
            <div className={styles.fileMeta}>{formatSize(file.size)}</div>
          </div>
          <button
            type="button"
            className={styles.fileRemove}
            onClick={onFileRemove}
            aria-label="Remover arquivo"
            disabled={disabled}
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        <>
          <div
            className={`${styles.dropZone} ${dragActive ? styles.dropZoneActive : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') handleClick();
            }}
            aria-label="Selecionar arquivo CSV"
          >
            <div className={styles.dropIcon}>
              <svg width="40" height="40" viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div className={styles.dropTitle}>
              Arraste o arquivo CSV aqui ou{' '}
              <span className={styles.dropAccent}>clique para selecionar</span>
            </div>
            <div className={styles.dropSub}>Formato aceito: CSV (.csv) com cabeçalho</div>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleInputChange}
            style={{ display: 'none' }}
            aria-hidden="true"
          />
        </>
      )}

      <div className={styles.templateRow}>
        <span className={styles.panelSub}>
          Colunas obrigatórias: cn, issuer, owner, environment
        </span>
        <button type="button" className={styles.templateLink} onClick={handleDownloadTemplate}>
          <svg width="14" height="14" viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download template CSV
        </button>
      </div>
    </div>
  );
}
