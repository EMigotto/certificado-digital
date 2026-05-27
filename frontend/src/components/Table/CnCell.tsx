interface CnCellProps {
  commonName: string;
  sans: string[];
}

export function CnCell({ commonName, sans }: CnCellProps) {
  const sanCount = sans.length;
  let sanLabel: string;
  if (sanCount === 0) {
    sanLabel = '+ 0 SANs';
  } else if (sanCount === 1) {
    sanLabel = '+ 1 SAN';
  } else {
    sanLabel = `+ ${sanCount} SANs`;
  }

  // Show first SANs as detail when present (≤3)
  const sanDetail =
    sanCount > 0 && sanCount <= 3
      ? `${sanLabel}: ${sans.join(', ')}`
      : sanLabel;

  return (
    <div
      style={{
        fontFamily: 'var(--mono)',
        fontWeight: 500,
        fontSize: '12.5px',
      }}
    >
      {commonName}
      <span
        style={{
          display: 'block',
          color: 'var(--text-mute)',
          fontSize: '11px',
          marginTop: '2px',
          fontWeight: 400,
        }}
      >
        {sanDetail}
      </span>
    </div>
  );
}
