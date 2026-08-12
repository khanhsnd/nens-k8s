import { ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { NAV_SECTIONS, type NavSection } from '@/features/navigation/nav.model'
import { useNav } from '@/features/navigation/nav.store'
import { activeTab, useTabs } from '@/features/tabs/tab.store'
import { useClusters, activeCluster } from '@/features/clusters/cluster.store'
import { cn } from '@/shared/lib/cn'

function Section({ section }: { section: NavSection }) {
  const { expanded, toggleSection } = useNav()
  const tab = useTabs(activeTab)
  const openTab = useTabs((s) => s.open)
  const open = expanded[section.id]
  const Icon = section.icon

  return (
    <div>
      <button
        onClick={() => toggleSection(section.id)}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-[7px] text-left transition-colors',
          'text-muted hover:bg-raised hover:text-text',
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className="flex-1 truncate text-[12.5px] font-medium">{section.label}</span>
        <ChevronRight
          className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')}
        />
      </button>

      {open && (
        <div className="ml-[15px] border-l border-line pl-2">
          {section.children.map((leaf) => {
            const selected = tab?.sectionId === section.id && tab.leafId === leaf.id
            return (
              <button
                key={leaf.id}
                onClick={() => openTab(section.id, leaf.id)}
                className={cn(
                  'block w-full truncate rounded-md px-2 py-[5px] text-left text-[12.5px] transition-colors',
                  selected
                    ? 'bg-accent-dim font-medium text-accent'
                    : 'text-muted hover:bg-raised hover:text-text',
                )}
              >
                {leaf.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ResizeHandle({ onResize }: { onResize: (width: number) => void }) {
  const dragging = useRef(false)

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    dragging.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (dragging.current) onResize(event.clientX - 56)
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
      onPointerDown={onPointerDown}
      className="absolute right-0 top-0 h-full w-1 cursor-col-resize transition-colors hover:bg-accent/40"
    />
  )
}

export function Sidebar() {
  const width = useNav((s) => s.sidebarWidth)
  const setWidth = useNav((s) => s.setSidebarWidth)
  const cluster = useClusters(activeCluster)
  const [query, setQuery] = useState('')

  const sections = query
    ? NAV_SECTIONS.map((section) => ({
        ...section,
        children: section.children.filter((leaf) =>
          leaf.label.toLowerCase().includes(query.toLowerCase()),
        ),
      })).filter((section) => section.children.length > 0)
    : NAV_SECTIONS

  return (
    <aside
      style={{ width }}
      className="relative flex shrink-0 flex-col border-r border-line bg-surface"
    >
      <div className="border-b border-line px-3 py-3">
        <div className="truncate text-[13px] font-semibold">{cluster?.name ?? 'No cluster'}</div>
        <div className="truncate text-[11px] text-faint">
          {cluster?.version || 'not connected'}
        </div>
      </div>

      <div className="px-2 pt-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter resources"
          className="w-full rounded-md border border-line bg-base px-2.5 py-1.5 text-[12px] text-text placeholder:text-faint outline-none focus:border-accent/60"
        />
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {sections.map((section) => (
          <Section key={section.id} section={section} />
        ))}
      </div>

      <ResizeHandle onResize={setWidth} />
    </aside>
  )
}
