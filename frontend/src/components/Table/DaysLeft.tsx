interface DaysLeftProps {
  days: number;
}

export function DaysLeft({ days }: DaysLeftProps) {
  let color: string;
  if (days <= 0) {
    color = 'var(--crit)';
  } else if (days <= 30) {
    color = 'var(--crit)';
  } else if (days <= 90) {
    color = 'var(--warn)';
  } else {
    color = 'var(--text-dim)';
  }

  const label = days <= 0 ? 'Vencido' : `${days} dia${days !== 1 ? 's' : ''}`;

  return (
    <span
      style={{
        fontFamily: 'var(--mono)',
        fontSize: '12px',
        fontWeight: 500,
        color,
      }}
    >
      {label}
    </span>
  );
}
