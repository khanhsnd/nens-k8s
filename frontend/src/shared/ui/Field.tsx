import type { ReactNode } from 'react'

/**
 * One labelled line of a detail panel. The divider is what makes a long panel
 * scannable — a light theme has too little contrast between rows without it.
 */
export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 border-b border-line/60 py-1.5 last:border-0">
      <dt className="font-medium text-muted">{label}</dt>
      <dd className="truncate font-mono text-sm text-text">{value}</dd>
    </div>
  )
}

export function Heading({ children }: { children: string }) {
  return (
    <div className="text-2xs font-semibold uppercase tracking-wider text-muted">{children}</div>
  )
}
