import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ResourceRef } from '@/features/resources/resource.types'
import { copyText } from '@/shared/lib/clipboard'
import { downloadText } from '@/shared/lib/download'
import { listContainers } from '@/features/containers/container.api'
import { targetKey, type ContainerTarget } from '@/features/containers/container.types'
import { CAPACITIES } from './log.buffer'
import { EMPTY_SEARCH } from './log.search'
import { closeLogs, openLogs, touchLogs, useLogs } from './log.store'
import type { LogSearch } from './log.types'
import { LogToolbar, type LogControls } from './LogToolbar'
import { LogView } from './LogView'

const DEFAULTS: LogControls = {
  tail: 1000,
  since: 0,
  previous: false,
  timestamps: false,
  capacity: CAPACITIES[1],
  wrap: true,
  follow: true,
}

/** Every app container of the first pod — one rule that fits a pod and a workload. */
function defaultSelection(targets: ContainerTarget[]): string[] {
  const first = targets[0]?.pod
  return targets
    .filter((target) => target.pod === first && target.role === 'app')
    .map(targetKey)
}

export function LogPanel({ target }: { target: ResourceRef }) {
  const id = `logs:${target.uid}`
  const session = useLogs((state) => state.sessions[id])

  const [targets, setTargets] = useState<ContainerTarget[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [selection, setSelection] = useState<string[]>([])
  const [controls, setControls] = useState(DEFAULTS)
  const [search, setSearch] = useState<LogSearch>(EMPTY_SEARCH)
  const [wanted, setWanted] = useState(0)

  useEffect(() => {
    let live = true
    setTargets(null)
    setFailed(null)

    listContainers(target)
      .then((found) => {
        if (!live) return
        setTargets(found)
        setSelection(defaultSelection(found))
      })
      .catch((error) => live && setFailed(String(error)))

    return () => {
      live = false
    }
  }, [target])

  useEffect(() => () => closeLogs(id), [id])

  const chosen = useMemo(
    () => (targets ?? []).filter((item) => selection.includes(targetKey(item))),
    [targets, selection],
  )
  const streams = selection.join('|')

  useEffect(() => {
    if (chosen.length === 0) return
    void openLogs(
      id,
      target.clusterId,
      chosen,
      {
        follow: !controls.previous,
        tailLines: controls.tail,
        sinceSeconds: controls.since,
        timestamps: controls.timestamps,
        previous: controls.previous,
      },
      controls.capacity,
    )
    // `chosen` is rebuilt on every targets change; `streams` is what actually differs.
  }, [id, target.clusterId, streams, controls.tail, controls.since, controls.timestamps, controls.previous])

  const buffer = session?.buffer

  useEffect(() => {
    if (!buffer) return
    buffer.capacity = controls.capacity
    touchLogs(id)
  }, [buffer, controls.capacity, id])

  useEffect(() => {
    if (!buffer) return
    buffer.search(search)
    setWanted(0)
    touchLogs(id)
  }, [buffer, search, id])

  const step = useCallback(
    (delta: number) => {
      const matches = buffer?.matchCount() ?? 0
      if (matches === 0) return
      setControls((current) => ({ ...current, follow: false }))
      setWanted((at) => (at + delta + matches) % matches)
    },
    [buffer],
  )

  const changeSearch = useCallback((changes: Partial<LogSearch>) => {
    setSearch((current) => ({ ...current, ...changes }))
    if (changes.query) setControls((current) => ({ ...current, follow: false }))
  }, [])

  if (failed) return <div className="p-4 text-sm text-danger">{failed}</div>
  if (!targets) return <div className="p-4 text-sm text-faint">Looking for containers…</div>
  if (targets.length === 0) {
    return <div className="p-4 text-sm text-faint">Nothing here writes logs</div>
  }

  // A restart can shrink the match set under the cursor, so clamp instead of tracking it.
  const matches = buffer?.matchCount() ?? 0
  const cursor = matches === 0 ? -1 : Math.min(wanted, matches - 1)

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-base">
      <LogToolbar
        targets={targets}
        selection={selection}
        onSelection={setSelection}
        controls={controls}
        onControls={(changes) => setControls((current) => ({ ...current, ...changes }))}
        search={search}
        onSearch={changeSearch}
        matches={matches}
        cursor={cursor}
        onStep={step}
        onClear={() => {
          buffer?.clear()
          touchLogs(id)
        }}
        onCopy={() => void copyText(buffer?.text() ?? '')}
        onDownload={() => downloadText(`${target.name}.log`, buffer?.text() ?? '')}
      />

      {session?.error && (
        <div className="shrink-0 border-b border-line bg-raised px-3 py-1.5 font-mono text-xs text-danger">
          {session.error}
        </div>
      )}

      {buffer && session ? (
        <LogView
          buffer={buffer}
          version={session.version}
          wrap={controls.wrap}
          follow={controls.follow}
          cursor={cursor}
          onLeaveFollow={() => setControls((current) => ({ ...current, follow: false }))}
        />
      ) : (
        <div className="grid min-h-0 flex-1 place-items-center text-sm text-faint">
          {selection.length === 0 ? 'Pick a container' : 'Connecting…'}
        </div>
      )}

      <div className="flex shrink-0 items-center gap-3 border-t border-line bg-surface px-3 py-1 text-xs text-faint">
        <span>{(buffer?.size() ?? 0).toLocaleString()} lines</span>
        {buffer && buffer.total > buffer.size() && (
          <span>of {buffer.total.toLocaleString()} received</span>
        )}
        {buffer && buffer.dropped > 0 && (
          <span className="text-warn">{buffer.dropped.toLocaleString()} dropped</span>
        )}
        {search.query !== '' && <span>{matches.toLocaleString()} matching</span>}
        <span className="ml-auto">
          {session && session.live > 0 ? `streaming ${session.live}` : 'stream ended'}
        </span>
      </div>
    </div>
  )
}
