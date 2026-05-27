/**
 * UploadPage — single certificate upload flow.
 *
 * Flow:
 * 1. Select file (.pem, .crt, .der, .cer, .p12, .pfx)
 * 2. If PKCS#12 → password prompt
 * 3. Client-side preview of metadata
 * 4. Fill form fields (owner, env, app, tags)
 * 5. Submit → success toast + redirect, or duplicate dialog, or error
 */

import { useCallback, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { parseCertificateFile, isPkcs12, type CertPreview } from '@/utils/certParser';
import { useImportCertificate, type ImportError } from '@/hooks/useImportCertificate';
import { useUiStore } from '@/store/uiStore';
import { Button } from '@/components/Button/Button';
import type { DuplicateInfo } from '@/services/certificateApi';
import { FileInput } from './components/FileInput';
import { PasswordPrompt } from './components/PasswordPrompt';
import { MetadataPreview } from './components/MetadataPreview';
import { UploadForm, type UploadFormHandle } from './components/UploadForm';
import { DuplicateDialog } from './components/DuplicateDialog';
import styles from './UploadPage.module.css';

export function UploadPage() {
  const navigate = useNavigate();
  const formRef = useRef<UploadFormHandle>(null);
  const addToast = useUiStore((s) => s.addToast);

  // ── State ─────────────────────────────────────────
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [preview, setPreview] = useState<CertPreview | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<DuplicateInfo | null>(null);

  const importMutation = useImportCertificate();

  // ── File selection handler ────────────────────────
  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    setParseError(null);
    setPreview(null);
    setDuplicateInfo(null);

    if (isPkcs12(selectedFile.name)) {
      setNeedsPassword(true);
      setPreview({
        format: 'PKCS12',
        commonName: '',
        sans: [],
        issuer: '',
        notBefore: '',
        notAfter: '',
        algorithm: '',
        serial: '',
        parsed: false,
        message:
          'Arquivo PKCS#12 detectado. Informe a senha para que o servidor extraia os metadados.',
      });
      return;
    }

    setNeedsPassword(false);

    try {
      const buffer = await selectedFile.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const result = parseCertificateFile(selectedFile.name, bytes);

      if (result.ok) {
        setPreview(result.preview);
      } else {
        setParseError(result.error);
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Erro ao ler o arquivo');
    }
  }, []);

  const handleFileRemove = useCallback(() => {
    setFile(null);
    setPreview(null);
    setParseError(null);
    setNeedsPassword(false);
    setPassword('');
    setDuplicateInfo(null);
  }, []);

  // ── Submit handler ────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!file || !formRef.current) return;

    const formData = await formRef.current.submit();
    if (!formData) return;

    importMutation.mutate(
      {
        file,
        metadata: {
          owner: formData.owner,
          environment: formData.environment,
          application: formData.application ?? '',
          tags: formData.tags ?? '',
        },
        password: needsPassword ? password : undefined,
      },
      {
        onSuccess: (data) => {
          addToast({ type: 'success', message: 'Certificado importado com sucesso!' });
          setTimeout(() => {
            navigate(`/certificates/${data.certificate.id}`);
          }, 1500);
        },
        onError: (error: ImportError) => {
          if (error.type === 'duplicate') {
            setDuplicateInfo(error.data.duplicate);
          } else if (error.type === 'invalid') {
            addToast({ type: 'error', message: error.data.message });
          } else if (error.type === 'unsupported') {
            addToast({
              type: 'error',
              message: `${error.data.message} — Formatos suportados: ${error.data.supportedFormats.join(', ')}`,
            });
          } else {
            addToast({ type: 'error', message: error.message });
          }
        },
      },
    );
  }, [file, password, needsPassword, importMutation, navigate, addToast]);

  // ── Duplicate dialog handlers ─────────────────────
  const handleDuplicateOverwrite = useCallback(() => {
    setDuplicateInfo(null);
    addToast({
      type: 'error',
      message: 'Sobrescrita ainda não implementada. Remova o certificado existente primeiro.',
    });
  }, [addToast]);

  const handleDuplicateNewVersion = useCallback(() => {
    setDuplicateInfo(null);
    addToast({ type: 'error', message: 'Criação de nova versão ainda não implementada.' });
  }, [addToast]);

  const handleDuplicateCancel = useCallback(() => {
    setDuplicateInfo(null);
  }, []);

  // ── Render ────────────────────────────────────────
  const isSubmitting = importMutation.isPending;

  return (
    <div className={styles.page}>
      {/* Breadcrumb */}
      <div className={styles.breadcrumb}>
        <Link to="/certificates">Certificados</Link>
        <span className={styles.breadcrumbSep}>/</span>
        <span className={styles.breadcrumbCur}>Upload</span>
      </div>

      {/* Section header */}
      <div className={styles.secHead}>
        <div>
          <div className={styles.secTitle}>
            <em>Upload</em> de certificado
          </div>
          <div className={styles.secTag} style={{ marginTop: 8 }}>
            Importar certificado individual — PEM, DER ou PKCS#12
          </div>
        </div>
      </div>

      {/* Step 1: File selection */}
      <div className={styles.formCard}>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>Arquivo do certificado</label>
          <FileInput
            file={file}
            onFileSelect={handleFileSelect}
            onFileRemove={handleFileRemove}
            disabled={isSubmitting}
          />
        </div>

        {/* Parse error */}
        {parseError && (
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
            <div style={{ color: 'var(--crit)' }}>{parseError}</div>
          </div>
        )}

        {/* Step 2: Password prompt for PKCS#12 */}
        {needsPassword && (
          <PasswordPrompt value={password} onChange={setPassword} disabled={isSubmitting} />
        )}
      </div>

      {/* Step 3: Metadata preview */}
      {preview && <MetadataPreview preview={preview} />}

      {/* Step 4: Form fields */}
      {file && !parseError && (
        <>
          <UploadForm ref={formRef} disabled={isSubmitting} defaultOwner="" />

          {/* Actions */}
          <div className={styles.actions}>
            <div className={styles.spacer} />
            <Link to="/certificates">
              <Button variant="secondary">Cancelar</Button>
            </Link>
            <Button variant="primary" onClick={handleSubmit} disabled={isSubmitting || !file}>
              {isSubmitting ? (
                <>
                  <span className={styles.spinner} />
                  Importando...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Importar certificado
                </>
              )}
            </Button>
          </div>
        </>
      )}

      {/* Duplicate dialog */}
      {duplicateInfo && (
        <DuplicateDialog
          duplicate={duplicateInfo}
          onOverwrite={handleDuplicateOverwrite}
          onNewVersion={handleDuplicateNewVersion}
          onCancel={handleDuplicateCancel}
          loading={isSubmitting}
        />
      )}
    </div>
  );
}
