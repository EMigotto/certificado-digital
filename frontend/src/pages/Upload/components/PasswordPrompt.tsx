/**
 * PasswordPrompt — shown when a PKCS#12 (.p12/.pfx) file is detected.
 */

import styles from '../UploadPage.module.css';

interface PasswordPromptProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function PasswordPrompt({ value, onChange, disabled }: PasswordPromptProps) {
  return (
    <div className={styles.passwordPrompt}>
      <svg className={styles.passwordIcon} width="20" height="20" viewBox="0 0 24 24">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      <div className={styles.passwordContent}>
        <div className={styles.passwordLabel}>Arquivo PKCS#12 detectado</div>
        <div className={styles.passwordHint}>
          Informe a senha do keystore para que o certificado possa ser extraído.
        </div>
        <input
          type="password"
          className={styles.passwordInput}
          placeholder="Senha do PKCS#12..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          autoComplete="off"
        />
      </div>
    </div>
  );
}
