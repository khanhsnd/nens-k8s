import type { ReactNode } from 'react'

/** One labelled line of a detail panel. */
export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 py-1.5">
      <dt className="text-faint">{label}</dt>
      <dd className="truncate font-mono text-sm">{value}</dd>
    </div>
  )
}

export function Heading({ children }: { children: string }) {
  return <div className="text-xs uppercase tracking-wide text-faint">{children}</div>
}
