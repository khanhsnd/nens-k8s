import { X } from 'lucide-react'
import { useState } from 'react'
import type { Kind } from '@/features/resources/kinds'
import type { K8sObject } from '@/features/resources/resource.types'
import { cn } from '@/shared/lib/cn'

const TABS = ['Overview', 'YAML', 'Logs', 'Events', 'Shell'] as const

const PHASE = { YAML: '3', Logs: '4', Events: '3', Shell: '5' } as const

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 py-1.5">
      <dt className="text-faint">{label}</dt>
      <dd className="truncate font-mono text-[12px]">{value}</dd>
    </div>
  )
}

export function DetailDrawer({
  object,
  kind,
  onClose,
}: {
  object: K8sObject
  kind: Kind
  onClose: () => void
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview')
  const labels = Object.entries(object.metadata.labels ?? {})

  return (
    <aside className="flex w-[420px] shrink-0 flex-col border-l border-line bg-surface">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <span className="truncate text-[13px] font-semibold">{object.metadata.name}</span>
        <button
          onClick={onClose}
          className="ml-auto grid size-7 place-items-center rounded-md text-muted transition-colors hover:bg-raised hover:text-text"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex shrink-0 gap-1 border-b border-line px-2">
        {TABS.map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={cn(
              'relative px-2.5 py-2 text-[12px] transition-colors',
              tab === item ? 'text-accent' : 'text-muted hover:text-text',
            )}
          >
            {item}
            {tab === item && (
              <span className="absolute inset-x-1 -bottom-px h-0.5 rounded bg-accent" />
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'Overview' ? (
          <>
            <dl className="text-[12px]">
              <Field label="Kind" value={object.kind ?? '—'} />
              {kind.columns
                .filter((column) => column.key !== 'name')
                .map((column) => (
                  <Field key={column.key} label={column.label} value={column.text(object)} />
                ))}
              <Field label="UID" value={object.metadata.uid} />
            </dl>

            {labels.length > 0 && (
              <div className="mt-4 space-y-1.5">
                <div className="text-[11px] uppercase tracking-wide text-faint">Labels</div>
                <div className="flex flex-wrap gap-1">
                  {labels.map(([key, value]) => (
                    <span
                      key={key}
                      className="truncate rounded bg-raised px-1.5 py-0.5 font-mono text-[11px] text-muted"
                    >
                      {key}={value}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="grid h-full place-items-center text-[12px] text-faint">
            {tab} panel — phase {PHASE[tab]}
          </div>
        )}
      </div>
    </aside>
  )
}
