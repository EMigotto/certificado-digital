import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { HeatmapData } from '@certificado-digital/shared';
import styles from './HeatmapPanel.module.css';

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Map a certificate count to a heat level class name */
function getHeatLevel(count: number): string | undefined {
  if (count <= 0) return undefined;
  if (count <= 5) return styles.l1;
  if (count <= 15) return styles.l2;
  if (count <= 30) return styles.l3;
  if (count <= 60) return styles.l4;
  return styles.l5;
}

/** Format a Date to "dd/mm" for tooltip display */
function formatShortDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

/** Format a Date to ISO date string for URL params */
function formatIsoDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// ─── Component ────────────────────────────────────────────────────────────

export interface HeatmapPanelProps {
  heatmapData: HeatmapData;
}

/**
 * 90-day expiration heatmap panel.
 *
 * Renders a 30-column × 3-row grid where each cell represents 1 day.
 * Cell color intensity is based on how many certificates expire on that day.
 * Hover shows a tooltip with count + date; click navigates to filtered inventory.
 *
 * Matches the prototype's "Expirações nos próximos 90 dias" panel exactly.
 */
export function HeatmapPanel({ heatmapData }: HeatmapPanelProps) {
  const navigate = useNavigate();
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);

  /** Build the 90-day cell array: day offsets 0..89 (today → +89d) */
  const cells = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Array.from({ length: 90 }, (_, i) => {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const count = heatmapData[i] ?? 0;
      return { dayOffset: i, date, count };
    });
  }, [heatmapData]);

  const handleClick = useCallback(
    (date: Date) => {
      void navigate(`/certificates?expiresOn=${formatIsoDate(date)}`);
    },
    [navigate],
  );

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <div className={styles.panelTitle}>Expirações nos próximos 90 dias</div>
          <div className={styles.panelSub}>
            Cada célula = 1 dia · intensidade = qtd. de certificados
          </div>
        </div>
        <div className={styles.panelSubRight}>90d → 1d</div>
      </div>

      {/* Heatmap grid: 30 cols × 3 rows */}
      <div className={styles.heatmap} role="grid" aria-label="Heatmap de expirações">
        {cells.map((cell) => {
          const levelClass = getHeatLevel(cell.count);
          return (
            <div
              key={cell.dayOffset}
              className={`${styles.heatCell}${levelClass ? ` ${levelClass}` : ''}`}
              role="gridcell"
              aria-label={`${cell.count} cert(s) expiring on ${formatShortDate(cell.date)}`}
              onMouseEnter={() => setHoveredDay(cell.dayOffset)}
              onMouseLeave={() => setHoveredDay(null)}
              onClick={() => handleClick(cell.date)}
            >
              {hoveredDay === cell.dayOffset && (
                <div className={styles.tooltip}>
                  {cell.count} cert(s) — {formatShortDate(cell.date)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* X-axis labels */}
      <div className={styles.heatmapAxis}>
        <span>Hoje</span>
        <span>+30d</span>
        <span>+60d</span>
        <span>+90d</span>
      </div>

      {/* Legend */}
      <div className={styles.heatmapLegend}>
        <span>Menos</span>
        <div className={`${styles.legendCell} ${styles.legendEmpty}`} />
        <div className={`${styles.legendCell} ${styles.legendL1}`} />
        <div className={`${styles.legendCell} ${styles.legendL2}`} />
        <div className={`${styles.legendCell} ${styles.legendL3}`} />
        <div className={`${styles.legendCell} ${styles.legendL4}`} />
        <div className={`${styles.legendCell} ${styles.legendL5}`} />
        <span>Mais</span>
      </div>
    </div>
  );
}
