import { cn } from '@/shared/lib/cn'

const SIZE = 88
const STROKE = 9
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * A ring of a whole. The arc takes `currentColor`, so the caller sets the tone
 * with a text colour and this stays one component for every gauge.
 */
export function Donut({
  /** 0–1, or null when there is nothing to measure against. */
  ratio,
  className,
}: {
  ratio: number | null
  className?: string
}) {
  const filled = ratio === null ? 0 : Math.min(1, Math.max(0, ratio))

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className={cn('size-22 shrink-0', className)}
      role="img"
      aria-label={ratio === null ? 'no data' : `${Math.round(filled * 100)}%`}
    >
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        stroke="var(--color-line)"
        strokeWidth={STROKE}
      />
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={`${filled * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
        transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
      />
      <text
        x={SIZE / 2}
        y={SIZE / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-current text-lg font-semibold"
      >
        {ratio === null ? '—' : `${Math.round(filled * 100)}%`}
      </text>
    </svg>
  )
}
