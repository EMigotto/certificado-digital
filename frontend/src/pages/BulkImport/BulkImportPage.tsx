/**
 * BulkImportPage — CSV import flow.
 *
 * Flow:
 * 1. Upload CSV file + download template link
 * 2. Client-side parse → preview first 100 rows
 * 3. Server validation → row-level status (valid/error/duplicate)
 * 4. "Continue with valid rows" or "Cancel"
 * 5. Import progress bar
 * 6. Summary: imported/failed + download failed rows
 */

import { useCallback, useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { parseCsvPreview, readFileAsText, type CsvPreviewResult } from '@/utils/csvPreview';
import { useCsvPreview, useCsvExecute, type BulkImportError } from '@/hooks/useBulkImport';
import { useUiStore } from '@/store/uiStore';
import { Button } from '@/components/Button/Button';
import type { CsvPreviewResponse, CsvImportSummary } from '@/services/certificateApi';
import { CsvUpload } from './components/CsvUpload';
import { ValidationPreview } from './components/ValidationPreview';
import { ProgressBar } from './components/ProgressBar';
import { ImportSummary } from './components/ImportSummary';
import styles from './BulkImportPage.module.css';

type Step = 'upload' | 'preview' | 'importing' | 'summary';

export function BulkImportPage() {
  const addToast = useUiStore((s) => s.addToast);

  // ── State ─────────────────────────────────────────
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [clientPreview, setClientPreview] = useState<CsvPreviewResult | null>(null);
  const [serverPreview, setServerPreview] = useState<CsvPreviewResponse | null>(null);
  const [importSummary, setImportSummary] = useState<CsvImportSummary | null>(null);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const csvPreviewMutation = useCsvPreview();
  const csvExecuteMutation = useCsvExecute();

  // ── File selection → client-side parse + server preview ──
  const handleFileSelect = useCallback(
    async (selectedFile: File) => {
      setFile(selectedFile);
      setServerPreview(null);
      setClientPreview(null);
      setImportSummary(null);
      setStep('preview');

      try {
        const content = await readFileAsText(selectedFile);
        const preview = parseCsvPreview(content);
        setClientPreview(preview);

        if (preview.headerErrors.length > 0) {
          addToast({
            type: 'error',
            message: `Erros no cabeçalho: ${preview.headerErrors.join(', ')}`,
          });
          return;
        }
      } catch (err) {
        addToast({
          type: 'error',
          message: err instanceof Error ? err.message : 'Erro ao ler o arquivo CSV',
        });
        setStep('upload');
        return;
      }

      csvPreviewMutation.mutate(selectedFile, {
        onSuccess: (data) => {
          setServerPreview(data);
        },
        onError: (error: BulkImportError) => {
          if (error.type === 'header_error' && error.headerErrors) {
            addToast({
              type: 'error',
              message: `Validação do servidor: ${error.headerErrors.join(', ')}`,
            });
          } else {
            addToast({ type: 'error', message: error.message });
          }
        },
      });
    },
    [csvPreviewMutation, addToast],
  );

  const handleFileRemove = useCallback(() => {
    setFile(null);
    setClientPreview(null);
    setServerPreview(null);
    setImportSummary(null);
    setStep('upload');
    setProgress(0);
  }, []);

  // ── Execute import ────────────────────────────────
  const handleExecuteImport = useCallback(() => {
    if (!file) return;

    setStep('importing');
    setProgress(10);

    progressRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressRef.current);
          return 90;
        }
        return prev + Math.random() * 15;
      });
    }, 500);

    csvExecuteMutation.mutate(file, {
      onSuccess: (data) => {
        clearInterval(progressRef.current);
        setProgress(100);
        setImportSummary(data);
        setTimeout(() => setStep('summary'), 800);
      },
      onError: (error: BulkImportError) => {
        clearInterval(progressRef.current);
        setProgress(0);
        setStep('preview');
        addToast({ type: 'error', message: error.message });
      },
    });
  }, [file, csvExecuteMutation, addToast]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, []);

  // ── Derived values ────────────────────────────────
  const previewData = serverPreview ?? clientPreview;
  const validCount = serverPreview?.validCount ?? clientPreview?.validCount ?? 0;
  const errorCount = serverPreview?.errorCount ?? clientPreview?.errorCount ?? 0;
  const duplicateCount = serverPreview?.duplicateCount ?? 0;
  const hasHeaderErrors =
    (clientPreview?.headerErrors?.length ?? 0) > 0 ||
    (serverPreview?.headerErrors?.length ?? 0) > 0;
  const isValidating = csvPreviewMutation.isPending;

  return (
    <div className={styles.page}>
      {/* Breadcrumb */}
      <div className={styles.breadcrumb}>
        <Link to="/certificates">Certificados</Link>
        <span className={styles.breadcrumbSep}>/</span>
        <span className={styles.breadcrumbCur}>Importação CSV</span>
      </div>

      {/* Section header */}
      <div className={styles.secHead}>
        <div>
          <div className={styles.secTitle}>
            <em>Importação</em> em lote
          </div>
          <div className={styles.secTag} style={{ marginTop: 8 }}>
            CSV bulk import — validação prévia, progresso e resumo
          </div>
        </div>
        {previewData && step === 'preview' && (
          <div className={styles.secTag}>
            {previewData.rows?.length ?? 0} linhas analisadas
            {(previewData as CsvPreviewResult).totalRows
              ? ` de ${(previewData as CsvPreviewResult).totalRows}`
              : ''}
          </div>
        )}
      </div>

      {/* Step 1: CSV upload */}
      {(step === 'upload' || step === 'preview') && (
        <CsvUpload
          file={file}
          onFileSelect={handleFileSelect}
          onFileRemove={handleFileRemove}
          disabled={isValidating || csvExecuteMutation.isPending}
        />
      )}

      {/* Loading indicator during server validation */}
      {isValidating && (
        <div className={styles.policyNote}>
          <span className={styles.spinner} />
          <div>Validando linhas no servidor...</div>
        </div>
      )}

      {/* Header errors */}
      {hasHeaderErrors && (
        <div
          className={styles.policyNote}
          style={{
            borderColor: 'rgba(248, 113, 113, 0.3)',
            background: 'rgba(248, 113, 113, 0.05)',
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            style={{ flexShrink: 0, marginTop: 1, color: 'var(--crit)' }}
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M15 9l-6 6M9 9l6 6" />
          </svg>
          <div style={{ color: 'var(--crit)' }}>
            <strong>Erros no cabeçalho do CSV:</strong>
            <ul style={{ marginTop: 4, paddingLeft: 16 }}>
              {(serverPreview?.headerErrors ?? clientPreview?.headerErrors ?? []).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
            <div style={{ marginTop: 8, color: 'var(--text-mute)' }}>
              Faça download do template CSV para verificar o formato esperado.
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Validation preview */}
      {step === 'preview' && previewData && !hasHeaderErrors && previewData.rows.length > 0 && (
        <>
          <ValidationPreview
            rows={previewData.rows}
            validCount={validCount}
            errorCount={errorCount}
            duplicateCount={duplicateCount}
          />

          <div className={styles.actions}>
            <div className={styles.spacer} />
            <Button variant="secondary" onClick={handleFileRemove}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleExecuteImport}
              disabled={validCount === 0 || isValidating}
            >
              <svg width="14" height="14" viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {errorCount > 0 || duplicateCount > 0
                ? `Importar ${validCount} válidas (pular erros)`
                : `Importar ${validCount} certificados`}
            </Button>
          </div>
        </>
      )}

      {/* Step 3: Progress */}
      {step === 'importing' && (
        <ProgressBar
          progress={progress}
          message={progress >= 100 ? 'Importação concluída!' : 'Importando certificados válidos...'}
          complete={progress >= 100}
        />
      )}

      {/* Step 4: Summary */}
      {step === 'summary' && importSummary && <ImportSummary summary={importSummary} />}
    </div>
  );
}
