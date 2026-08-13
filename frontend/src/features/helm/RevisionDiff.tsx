import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { DiffView } from '@/shared/ui/DiffView'
import { Placeholder } from '@/shared/ui/Placeholder'
import { detailOf } from './helm.api'
import type { HelmDetail, HelmRef } from './helm.types'

const FIELDS = ['Values', 'Manifest'] as const

type Field = (typeof FIELDS)[number]

const read = (detail: HelmDetail, field: Field) =>
  field === 'Values' ? detail.values : detail.manifest

function Picker({
  value,
  options,
  onChange,
}: {
  value: number
  options: number[]
  onChange: (revision: number) => void
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="rounded border border-line bg-base px-1.5 py-1 font-mono text-xs text-text outline-none focus:border-accent/60"
    >
      {options.map((revision) => (
        <option key={revision} value={revision}>
          v{revision}
        </option>
      ))}
    </select>
  )
}

/**
 * Two revisions side by side is not an option in a drawer this narrow, so the
 * diff is unified. Both sides are read as whole revisions — helm keeps every one
 * of them, so comparing any two is two reads and no state.
 */
export function RevisionDiff({
  target,
  revisions,
  from,
  to,
  onClose,
}: {
  target: HelmRef
  revisions: number[]
  from: number
  to: number
  onClose: () => void
}) {
  const [pair, setPair] = useState({ from, to })
  const [field, setField] = useState<Field>('Values')
  const [sides, setSides] = useState<[HelmDetail, HelmDetail] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setSides(null)
    setError(null)

    Promise.all([detailOf(target, pair.from), detailOf(target, pair.to)])
      .then((both) => live && setSides(both))
      .catch((failure) => live && setError(String(failure)))

    return () => {
      live = false
    }
  }, [target, pair])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-2 py-1.5">
        <button
          onClick={onClose}
          title="Back to the history"
          className="grid size-6 place-items-center rounded text-muted transition-colors hover:bg-raised hover:text-text"
        >
          <ArrowLeft className="size-3.5" />
        </button>

        <Picker
          value={pair.from}
          options={revisions}
          onChange={(revision) => setPair((current) => ({ ...current, from: revision }))}
        />
        <ArrowRight className="size-3 text-faint" />
        <Picker
          value={pair.to}
          options={revisions}
          onChange={(revision) => setPair((current) => ({ ...current, to: revision }))}
        />

        <div className="ml-auto flex rounded border border-line">
          {FIELDS.map((item) => (
            <button
              key={item}
              onClick={() => setField(item)}
              className={cn(
                'px-2 py-1 text-xs transition-colors first:rounded-l last:rounded-r',
                field === item ? 'bg-accent-dim text-accent' : 'text-muted hover:text-text',
              )}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <Placeholder label={error} />
      ) : !sides ? (
        <Placeholder label="Reading both revisions…" />
      ) : (
        <DiffView before={read(sides[0], field)} after={read(sides[1], field)} />
      )}
    </div>
  )
}
