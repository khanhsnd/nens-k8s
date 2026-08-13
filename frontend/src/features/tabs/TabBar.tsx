import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { ContextMenu, type MenuAction } from '@/shared/ui/ContextMenu'
import { useTabs } from './tab.store'

type Spot = { x: number; y: number; id: string }

export function TabBar() {
  const tabs = useTabs((s) => s.tabs)
  const activeId = useTabs((s) => s.activeId)
  const activate = useTabs((s) => s.activate)
  const close = useTabs((s) => s.close)
  const closeOthers = useTabs((s) => s.closeOthers)
  const closeToSide = useTabs((s) => s.closeToSide)
  const closeAll = useTabs((s) => s.closeAll)
  const cycle = useTabs((s) => s.cycle)

  const [menu, setMenu] = useState<Spot | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      if (event.key === 'w' && activeId) {
        event.preventDefault()
        close(activeId)
      } else if (event.key === 'Tab') {
        event.preventDefault()
        cycle(event.shiftKey ? -1 : 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeId, close, cycle])

  const actionsFor = (id: string): MenuAction[] => {
    const index = tabs.findIndex((tab) => tab.id === id)

    return [
      { label: 'Close', onSelect: () => close(id) },
      { label: 'Close others', disabled: tabs.length < 2, onSelect: () => closeOthers(id) },
      {
        label: 'Close to the left',
        disabled: index < 1,
        onSelect: () => closeToSide(id, 'left'),
        separated: true,
      },
      {
        label: 'Close to the right',
        disabled: index === tabs.length - 1,
        onSelect: () => closeToSide(id, 'right'),
      },
      { label: 'Close all', onSelect: closeAll, separated: true },
    ]
  }

  return (
    <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-line bg-base">
      {tabs.map((tab) => {
        const active = tab.id === activeId

        return (
          <div
            key={tab.id}
            onClick={() => activate(tab.id)}
            // Middle click closes on *down*: the default is autoscroll, and only
            // preventing it there stops the drag ball from swallowing the release.
            onMouseDown={(event) => {
              if (event.button !== 1) return
              event.preventDefault()
              close(tab.id)
            }}
            onDoubleClick={() => closeOthers(tab.id)}
            onContextMenu={(event) => {
              event.preventDefault()
              setMenu({ x: event.clientX, y: event.clientY, id: tab.id })
            }}
            className={cn(
              'group flex min-w-[112px] max-w-[220px] shrink-0 cursor-pointer items-center gap-2 border-r border-line px-3 text-sm',
              active
                ? 'border-t-2 border-t-accent bg-surface font-medium text-text'
                : 'border-t-2 border-t-transparent text-muted hover:bg-raised hover:text-text',
            )}
          >
            <span className="flex-1 truncate">{tab.title}</span>
            <button
              onClick={(event) => {
                event.stopPropagation()
                close(tab.id)
              }}
              className={cn(
                'grid size-4 shrink-0 place-items-center rounded transition-colors hover:bg-line-strong hover:text-text',
                active ? 'text-faint' : 'text-transparent group-hover:text-faint',
              )}
            >
              <X className="size-3" />
            </button>
          </div>
        )
      })}

      {menu && (
        <ContextMenu
          at={menu}
          actions={actionsFor(menu.id)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
