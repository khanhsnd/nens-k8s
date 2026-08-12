import { useEffect, useState } from 'react'
import { age } from '@/shared/lib/format'
import { Dot } from '@/shared/ui/Badge'
import { listEvents } from './object.api'
import type { EventRecord, ResourceRef } from './resource.types'

export function ObjectEvents({ target }: { target: ResourceRef }) {
  const [records, setRecords] = useState<EventRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setRecords(null)
    setError(null)

    listEvents(target)
      .then((events) => live && setRecords(events))
      .catch((failure) => live && setError(String(failure)))

    return () => {
      live = false
    }
  }, [target])

  if (error) return <div className="p-4 text-sm text-danger">{error}</div>
  if (!records) return <div className="p-4 text-sm text-faint">Loading events…</div>
  if (records.length === 0) return <div className="p-4 text-sm text-faint">No events</div>

  return (
    <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
      {records.map((record, index) => (
        <li key={`${record.reason}-${record.last}-${index}`} className="space-y-1 px-4 py-2.5">
          <div className="flex items-center gap-1.5 text-sm">
            <Dot tone={record.type === 'Warning' ? 'warn' : 'ok'} />
            <span className="font-medium">{record.reason}</span>
            {record.count > 1 && <span className="text-faint">×{record.count}</span>}
            <span className="ml-auto shrink-0 text-xs text-faint">
              {record.last ? age(record.last) : '—'}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-muted">{record.message}</p>
          <div className="text-xs text-faint">{record.source}</div>
        </li>
      ))}
    </ul>
  )
}
