import { X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEditorGuard } from '@/features/resources/editor.store'
import type { Kind } from '@/features/resources/kinds'
import { refOf } from '@/features/resources/object.api'
import { ObjectActions } from '@/features/resources/ObjectActions'
import { ObjectEvents } from '@/features/resources/ObjectEvents'
import { ObjectOverview } from '@/features/resources/ObjectOverview'
import { ObjectYaml } from '@/features/resources/ObjectYaml'
import type { K8sObject } from '@/features/resources/resource.types'
import { cn } from '@/shared/lib/cn'

const TABS = ['Overview', 'YAML', 'Events', 'Logs', 'Shell'] as const
const PHASE: Partial<Record<(typeof TABS)[number], string>> = { Logs: '4', Shell: '5' }

const MIN_WIDTH = 360
const MAX_WIDTH = 1100

function ResizeHandle({ onResize }: { onResize: (width: number) => void }) {
  const dragging = useRef(false)

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (dragging.current) onResize(window.innerWidth - event.clientX)
    }
    const up = () => {
      dragging.current = false
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [onResize])

  return (
    <div
      onPointerDown={() => {
        dragging.current = true
      }}
      className="absolute left-0 top-0 h-full w-1 cursor-col-resize transition-colors hover:bg-accent/40"
    />
  )
}

export function DetailDrawer({
  object,
  kind,
  clusterId,
  onClose,
}: {
  object: K8sObject
  kind: Kind
  clusterId: string
  onClose: () => void
}) {
  const guard = useEditorGuard((s) => s.guard)
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview')
  const [width, setWidth] = useState(460)

  const uid = object.metadata.uid
  const target = useMemo(() => refOf(clusterId, kind, object), [clusterId, kind, uid])
  const resize = useCallback((next: number) => setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next))), [])

  return (
    <aside
      style={{ width }}
      className="relative flex shrink-0 flex-col border-l border-line bg-surface"
    >
      <ResizeHandle onResize={resize} />

      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-4">
        <span className="mr-auto truncate text-[13px] font-semibold">{object.metadata.name}</span>
        <ObjectActions target={target} object={object} onDeleted={onClose} />
        <button
          onClick={() => guard(onClose)}
          className="grid size-7 place-items-center rounded-md text-muted transition-colors hover:bg-raised hover:text-text"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex shrink-0 gap-1 border-b border-line px-2">
        {TABS.map((item) => (
          <button
            key={item}
            onClick={() => guard(() => setTab(item))}
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

      <div className="flex min-h-0 flex-1 flex-col">
        {tab === 'Overview' && <ObjectOverview object={object} kind={kind} target={target} />}
        {tab === 'YAML' && <ObjectYaml target={target} />}
        {tab === 'Events' && <ObjectEvents target={target} />}
        {PHASE[tab] && (
          <div className="grid flex-1 place-items-center text-[12px] text-faint">
            {tab} panel — phase {PHASE[tab]}
          </div>
        )}
      </div>
    </aside>
  )
}
