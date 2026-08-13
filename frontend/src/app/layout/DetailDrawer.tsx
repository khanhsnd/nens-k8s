import { X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useEditorGuard } from '@/features/resources/editor.store'
import type { Kind } from '@/features/resources/kinds'
import { refOf } from '@/features/resources/object.api'
import { ObjectActions } from '@/features/resources/ObjectActions'
import { ObjectEvents } from '@/features/resources/ObjectEvents'
import { ObjectOverview } from '@/features/resources/ObjectOverview'
import { ObjectYaml } from '@/features/resources/ObjectYaml'
import type { K8sObject } from '@/features/resources/resource.types'
import { cn } from '@/shared/lib/cn'
import { usePanelSize } from '@/shared/ui/panel.size'
import { Resizer } from '@/shared/ui/Resizer'

const TABS = ['Overview', 'YAML', 'Events'] as const

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
  const [width, setWidth] = usePanelSize('drawer', { initial: 460, min: 360, max: 1100 })

  const uid = object.metadata.uid
  const target = useMemo(() => refOf(clusterId, kind, object), [clusterId, kind, uid])

  // `select-text` undoes the app-wide `user-select: none`: everything in the
  // drawer is a value someone wants to drag over and copy with Ctrl+C.
  return (
    <aside
      style={{ width }}
      className="relative flex max-w-[70vw] shrink-0 select-text flex-col border-l border-line bg-surface"
    >
      <Resizer edge="left" onResize={setWidth} />

      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-4">
        <span className="mr-auto truncate text-md font-semibold">{object.metadata.name}</span>

        <ObjectActions target={target} object={object} kind={kind} onDeleted={onClose} />

        <span className="mx-1 h-4 w-px bg-line" />
        <button
          onClick={() => guard(onClose)}
          title="Close"
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
              'relative px-2.5 py-2 text-sm transition-colors',
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
      </div>
    </aside>
  )
}
