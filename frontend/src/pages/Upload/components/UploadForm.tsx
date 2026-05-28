/**
 * UploadForm — metadata form fields for single certificate upload.
 *
 * Fields: owner (required), environment (required), application, tags.
 * Uses React Hook Form with Zod validation.
 */

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useImperativeHandle, forwardRef } from 'react';
import styles from '../UploadPage.module.css';

// ─── Validation schema ──────────────────────────────────────────────────────

const uploadFormSchema = z.object({
  owner: z.string().min(1, 'Owner é obrigatório'),
  environment: z.enum(['dev', 'hml', 'prd'], {
    errorMap: () => ({ message: 'Selecione um ambiente' }),
  }),
  application: z.string(),
  tags: z.string(),
});

export type UploadFormValues = z.infer<typeof uploadFormSchema>;

// ─── Ref handle (for parent to trigger submit) ──────────────────────────────

export interface UploadFormHandle {
  submit: () => Promise<UploadFormValues | null>;
  isValid: () => boolean;
}

// ─── Component ──────────────────────────────────────────────────────────────

interface UploadFormProps {
  disabled?: boolean;
  defaultOwner?: string;
}

export const UploadForm = forwardRef<UploadFormHandle, UploadFormProps>(function UploadForm(
  { disabled, defaultOwner },
  ref,
) {
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<UploadFormValues>({
    resolver: zodResolver(uploadFormSchema),
    defaultValues: {
      owner: defaultOwner ?? '',
      environment: undefined,
      application: '',
      tags: '',
    },
    mode: 'onChange',
  });

  useImperativeHandle(ref, () => ({
    submit: () =>
      new Promise<UploadFormValues | null>((resolve) => {
        handleSubmit(
          (data) => resolve(data),
          () => resolve(null),
        )();
      }),
    isValid: () => isValid,
  }));

  return (
    <div className={styles.formCard}>
      <div className={styles.policyNote}>
        <svg width="16" height="16" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
        <div>
          <strong>Campos obrigatórios:</strong> Owner e Environment são necessários para categorizar
          o certificado no inventário.
        </div>
      </div>

      <div className={styles.formRow2}>
        <div>
          <label className={styles.formLabel}>Owner *</label>
          <input
            className={styles.formInput}
            placeholder="ex: time-pagamentos"
            disabled={disabled}
            {...register('owner')}
          />
          {errors.owner && <div className={styles.formError}>{errors.owner.message}</div>}
        </div>

        <div>
          <label className={styles.formLabel}>Environment *</label>
          <select className={styles.formSelect} disabled={disabled} {...register('environment')}>
            <option value="">Selecione...</option>
            <option value="dev">dev</option>
            <option value="hml">hml</option>
            <option value="prd">prd</option>
          </select>
          {errors.environment && (
            <div className={styles.formError}>{errors.environment.message}</div>
          )}
        </div>
      </div>

      <div className={styles.formRow2}>
        <div>
          <label className={styles.formLabel}>Application</label>
          <input
            className={styles.formInput}
            placeholder="ex: api-gateway"
            disabled={disabled}
            {...register('application')}
          />
          <div className={styles.formHint}>Nome da aplicação que utiliza o certificado</div>
        </div>

        <div>
          <label className={styles.formLabel}>Tags</label>
          <input
            className={styles.formInput}
            placeholder="ex: team:infra;env:production"
            disabled={disabled}
            {...register('tags')}
          />
          <div className={styles.formHint}>Formato: chave:valor separados por ponto-e-vírgula</div>
        </div>
      </div>
    </div>
  );
});
