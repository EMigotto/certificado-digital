import { Button } from '@/components/Button/Button';
import { Badge } from '@/components/Badge/Badge';
import styles from './ActionPanel.module.css';

interface ActionPanelProps {
  onExportPem: () => void;
  onExportJson: () => void;
  onRevoke: () => void;
  onRenew: () => void;
  onDelete: () => void;
  isRevoked: boolean;
  isExpired: boolean;
  exportLoading: boolean;
  daysUntilExpiry: number;
  hasRenewalChild: boolean;
  isAdmin?: boolean;
}

export function ActionPanel({
  onExportPem,
  onExportJson,
  onRevoke,
  onRenew,
  onDelete,
  isRevoked,
  isExpired,
  exportLoading,
  daysUntilExpiry,
  hasRenewalChild,
  isAdmin = false,
}: ActionPanelProps) {
  const canRenew =
    !isRevoked &&
    !hasRenewalChild &&
    (daysUntilExpiry <= 30 || isAdmin);

  const renewDisabledReason =
    isRevoked
      ? 'Revoked certificates cannot be renewed'
      : hasRenewalChild
        ? 'This certificate has already been renewed'
        : daysUntilExpiry > 30 && !isAdmin
          ? `Renewal available when ≤ 30 days until expiry (currently ${daysUntilExpiry}d)`
          : undefined;

  return (
    <div className={styles.panel}>
      <div className={styles.panelTitle}>Ações</div>

      <div className={styles.actions}>
        {/* Renew button */}
        <div className={styles.renewSection}>
          <Button
            variant="primary"
            onClick={onRenew}
            disabled={!canRenew}
            title={renewDisabledReason}
          >
            <svg width="14" height="14" viewBox="0 0 24 24">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Renovar
          </Button>
          {hasRenewalChild && (
            <Badge variant="renewed">Renewed</Badge>
          )}
        </div>

        <div className={styles.divider} />

        <Button
          variant="secondary"
          onClick={onExportPem}
          disabled={exportLoading}
        >
          <svg width="14" height="14" viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export PEM
        </Button>

        <Button
          variant="secondary"
          onClick={onExportJson}
          disabled={exportLoading}
        >
          <svg width="14" height="14" viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export JSON
        </Button>

        <Button variant="secondary" disabled title="Disponível em breve">
          <svg width="14" height="14" viewBox="0 0 24 24">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Editar
        </Button>

        <div className={styles.divider} />

        <Button
          variant="danger"
          onClick={onRevoke}
          disabled={isRevoked || isExpired}
        >
          <svg width="14" height="14" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
          {isRevoked ? 'Revogado' : 'Revogar'}
        </Button>

        <Button variant="danger" onClick={onDelete}>
          <svg width="14" height="14" viewBox="0 0 24 24">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          Excluir
        </Button>
      </div>
    </div>
  );
}
