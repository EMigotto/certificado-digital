import { Modal } from '@/components/Modal/Modal';
import { Button } from '@/components/Button/Button';
import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  variant: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  variant,
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className={styles.message}>{message}</p>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
        <Button variant={variant} onClick={onConfirm} disabled={loading}>
          {loading ? 'Processando…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
