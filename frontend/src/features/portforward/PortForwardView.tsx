import { Copy, Square } from 'lucide-react'
import { useMemo } from 'react'
import { copyText } from '@/shared/lib/clipboard'
import { DataGrid } from '@/shared/ui/DataGrid'
import { Placeholder } from '@/shared/ui/Placeholder'
import { FORWARD_COLUMNS } from './portforward.columns'
import { useForwards } from './portforward.store'
import { forwardAddress, type PortForward } from './portforward.types'

export function PortForwardView() {
  const forwards = useForwards((state) => state.forwards)
  const error = useForwards((state) => state.error)
  const stop = useForwards((state) => state.stop)

  const rows = useMemo(
    () => Object.values(forwards).sort((a, b) => a.localPort - b.localPort),
    [forwards],
  )

  const notice = error && (
    <div className="shrink-0 border-b border-line bg-raised px-3 py-1.5 text-xs text-danger">
      {error}
    </div>
  )

  if (rows.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {notice}
        <Placeholder label="No port forwards — open a pod, deployment or service and forward one" />
      </div>
    )
  }

  const actions = (row: PortForward) => (
    <>
      <button
        title="Copy the local address"
        onClick={() => void copyText(forwardAddress(row))}
        className="grid size-6 place-items-center rounded text-faint transition-colors hover:bg-overlay hover:text-accent"
      >
        <Copy className="size-3.5" />
      </button>
      <button
        title="Stop this forward"
        onClick={() => void stop(row.id)}
        className="grid size-6 place-items-center rounded text-faint transition-colors hover:bg-danger/15 hover:text-danger"
      >
        <Square className="size-3.5" />
      </button>
    </>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {notice}
      <DataGrid
        layoutId="portforward"
        rows={rows}
        columns={FORWARD_COLUMNS}
        rowKey={(row) => row.id}
        rowActions={actions}
      />
    </div>
  )
}
