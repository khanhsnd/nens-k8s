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
  const stop = useForwards((state) => state.stop)

  const rows = useMemo(
    () => Object.values(forwards).sort((a, b) => a.localPort - b.localPort),
    [forwards],
  )

  if (rows.length === 0) {
    return <Placeholder label="No port forwards — open a pod, deployment or service and forward one" />
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
    <DataGrid
      layoutId="portforward"
      rows={rows}
      columns={FORWARD_COLUMNS}
      rowKey={(row) => row.id}
      rowActions={actions}
    />
  )
}
