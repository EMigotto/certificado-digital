import { createColumnHelper } from '@tanstack/react-table';
import type { CertificateRow } from '@/services/certificateApi';
import type { CertStatus } from '@certificado-digital/shared';
import { Badge, type BadgeVariant } from '@/components/Badge/Badge';
import { CnCell } from '@/components/Table/CnCell';
import { EnvTag } from '@/components/Table/EnvTag';
import { DaysLeft } from '@/components/Table/DaysLeft';

const col = createColumnHelper<CertificateRow>();

/** Map status to badge variant + label */
function statusBadge(status: CertStatus): { variant: BadgeVariant; label: string } {
  const map: Record<CertStatus, { variant: BadgeVariant; label: string }> = {
    VALID: { variant: 'ok', label: 'Válido' },
    EXPIRING_SOON: { variant: 'warn', label: 'Atenção' },
    EXPIRED: { variant: 'crit', label: 'Vencido' },
    REVOKED: { variant: 'rev', label: 'Revogado' },
  };
  return map[status] ?? { variant: 'ok', label: status };
}

export const columns = [
  col.accessor('commonName', {
    id: 'commonName',
    header: 'Common Name / SANs',
    size: 320,
    cell: (info) => <CnCell commonName={info.getValue()} sans={info.row.original.sans} />,
    enableSorting: true,
  }),

  col.accessor('zone', {
    id: 'zone',
    header: 'Zona / Env',
    cell: (info) => (
      <EnvTag zone={info.getValue()} environment={info.row.original.environment} />
    ),
    enableSorting: true,
  }),

  col.accessor('status', {
    id: 'status',
    header: 'Status',
    cell: (info) => {
      const { variant, label } = statusBadge(info.getValue() ?? 'VALID');
      return <Badge variant={variant}>{label}</Badge>;
    },
    enableSorting: true,
  }),

  col.accessor('caName', {
    id: 'caName',
    header: 'CA / Algoritmo',
    cell: (info) => (
      <div>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: '10px',
            padding: '2px 6px',
            borderRadius: '3px',
            background: 'var(--surface-2)',
            color: 'var(--text-dim)',
            border: '1px solid var(--border)',
          }}
        >
          {info.getValue()}
        </span>
        <br />
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: '11px',
            color: 'var(--text-mute)',
          }}
        >
          {info.row.original.signatureAlgorithm}
        </span>
      </div>
    ),
    enableSorting: true,
  }),

  col.accessor('owner', {
    id: 'owner',
    header: 'Owner',
    cell: (info) => <span>{info.getValue()}</span>,
    enableSorting: true,
  }),

  col.accessor('daysUntilExpiry', {
    id: 'daysUntilExpiry',
    header: 'Expira em',
    cell: (info) => <DaysLeft days={info.getValue()} />,
    enableSorting: true,
  }),

  col.display({
    id: 'actions',
    header: '',
    size: 40,
    cell: () => (
      <span style={{ color: 'var(--text-mute)', cursor: 'pointer' }}>→</span>
    ),
    enableSorting: false,
  }),
];
