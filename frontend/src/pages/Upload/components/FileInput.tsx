/**
 * FileInput — drop zone / file picker for certificate files.
 *
 * Accepts .pem, .crt, .der, .cer, .p12, .pfx
 */

import { useCallback, useRef, useState } from 'react';
import { ACCEPTED_EXTENSIONS } from '@/utils/certParser';
import styles from '../UploadPage.module.css';

interface FileInputProps {
  file: File | null;
  onFileSelect: (file: File) => void;
  onFileRemove: () => void;
  disabled?: boolean;
}

export function FileInput({ file, onFileSelect, onFileRemove, disabled }: FileInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const acceptStr = ACCEPTED_EXTENSIONS.join(',');

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

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (file) {
    return (
      <div className={styles.fileSelected}>
        <svg className={styles.fileIcon} width="24" height="24" viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M9 15l2 2 4-4" />
        </svg>
        <div className={styles.fileInfo}>
          <div className={styles.fileName}>{file.name}</div>
          <div className={styles.fileSize}>{formatSize(file.size)}</div>
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
    );
  }

  return (
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
        aria-label="Selecionar arquivo de certificado"
      >
        <div className={styles.dropIcon}>
          <svg width="40" height="40" viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <div className={styles.dropTitle}>
          Arraste o certificado aqui ou{' '}
          <span className={styles.dropAccent}>clique para selecionar</span>
        </div>
        <div className={styles.dropSub}>
          Formatos aceitos: PEM (.pem, .crt) · DER (.der, .cer) · PKCS#12 (.p12, .pfx)
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={acceptStr}
        onChange={handleInputChange}
        style={{ display: 'none' }}
        aria-hidden="true"
      />
    </>
  );
}
