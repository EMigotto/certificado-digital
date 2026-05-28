import type { Environment } from '@certificado-digital/shared';

interface EnvTagProps {
  zone: string | null;
  environment: Environment;
}

export function EnvTag({ zone, environment }: EnvTagProps) {
  const isPrd = environment === 'PRD';
  const label = zone ? `${zone} / ${environment.toLowerCase()}` : environment.toLowerCase();
  return (
    <span
      style={{
        fontFamily: 'var(--mono)',
        fontSize: '10px',
        padding: '2px 6px',
        borderRadius: '3px',
        background: 'var(--surface-2)',
        color: isPrd ? 'var(--accent)' : 'var(--text-dim)',
        border: `1px solid ${isPrd ? 'rgba(94, 234, 212, 0.3)' : 'var(--border)'}`,
      }}
    >
      {label}
    </span>
  );
}
