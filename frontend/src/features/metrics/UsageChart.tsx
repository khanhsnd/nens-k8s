import { useState } from 'react'
import type { Point } from './pod.usage.store'

const HEIGHT = 40

type Tone = 'accent' | 'info'

const STROKE: Record<Tone, string> = { accent: 'text-accent', info: 'text-info' }

function path(values: number[], top: number): { line: string; area: string } {
  const y = (value: number) => (HEIGHT - (value / top) * HEIGHT).toFixed(2)
  const x = (index: number) => ((index / Math.max(1, values.length - 1)) * 100).toFixed(2)

  const line =
    values.length === 1
      ? `M0,${y(values[0])} L100,${y(values[0])}`
      : values.map((value, index) => `${index ? 'L' : 'M'}${x(index)},${y(value)}`).join(' ')

  return { line, area: `${line} L100,${HEIGHT} L0,${HEIGHT} Z` }
}

function clock(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * One container's usage over the samples collected so far. Plotted per sample
 * rather than per second: metrics-server has no history, so the series is only
 * as dense as the polls behind it — see `decisions/metrics.md`.
 */
export function UsageChart({
  label,
  tone,
  points,
  value,
  format,
  request,
  limit,
}: {
  label: string
  tone: Tone
  points: Point[]
  value: (point: Point) => number
  format: (value: number) => string
  request?: number
  limit?: number
}) {
  const [hover, setHover] = useState<number | null>(null)

  if (points.length === 0) return null

  const values = points.map(value)
  const peak = Math.max(...values)
  const top = Math.max(peak, limit ?? 0, request ?? 0) * 1.1 || 1
  const { line, area } = path(values, top)

  const shown = hover !== null && hover < values.length ? hover : values.length - 1
  const level = (amount: number) => (HEIGHT - (amount / top) * HEIGHT).toFixed(2)

  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline gap-2 text-xs">
        <span className="text-faint">{label}</span>
        <span className={STROKE[tone]}>{format(values[shown])}</span>
        <span className="ml-auto text-faint">
          {hover === null ? `peak ${format(peak)}` : clock(points[shown].at)}
        </span>
      </div>

      <svg
        viewBox={`0 0 100 ${HEIGHT}`}
        preserveAspectRatio="none"
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          const ratio = (event.clientX - box.left) / box.width
          setHover(Math.round(Math.min(1, Math.max(0, ratio)) * (values.length - 1)))
        }}
        onPointerLeave={() => setHover(null)}
        className={`h-12 w-full rounded bg-surface ${STROKE[tone]}`}
      >
        <path d={area} className="fill-current opacity-15" />
        <path
          d={line}
          fill="none"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          className="stroke-current"
        />

        {[request, limit].map(
          (amount, index) =>
            amount !== undefined &&
            amount > 0 && (
              <line
                key={index}
                x1="0"
                x2="100"
                y1={level(amount)}
                y2={level(amount)}
                strokeWidth={1}
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
                className={index === 0 ? 'stroke-ok/60' : 'stroke-warn/60'}
              />
            ),
        )}

        {hover !== null && (
          <line
            x1={((shown / Math.max(1, values.length - 1)) * 100).toFixed(2)}
            x2={((shown / Math.max(1, values.length - 1)) * 100).toFixed(2)}
            y1="0"
            y2={HEIGHT}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            className="stroke-current opacity-50"
          />
        )}
      </svg>

      <div className="flex gap-2 text-2xs text-faint">
        <span>{clock(points[0].at)}</span>
        {request !== undefined && request > 0 && (
          <span className="text-ok/80">request {format(request)}</span>
        )}
        {limit !== undefined && limit > 0 && (
          <span className="text-warn/80">limit {format(limit)}</span>
        )}
        <span className="ml-auto">{clock(points[points.length - 1].at)}</span>
      </div>
    </div>
  )
}
