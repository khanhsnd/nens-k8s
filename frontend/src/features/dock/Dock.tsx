import { Maximize2, Minimize2, ScrollText, SquareTerminal, X, type LucideIcon } from 'lucide-react'
import { LogPanel } from '@/features/logs/LogPanel'
import { TerminalPanel } from '@/features/terminal/TerminalPanel'
import { cn } from '@/shared/lib/cn'
import { usePanelSize } from '@/shared/ui/panel.size'
import { Resizer } from '@/shared/ui/Resizer'
import { useDock, type DockKind, type DockTool } from './dock.store'

const ICONS: Record<DockKind, LucideIcon> = { logs: ScrollText, shell: SquareTerminal }

const BOUNDS = { initial: 340, min: 140, max: 1400 }

function Tab({
  tool,
  active,
  onActivate,
  onClose,
}: {
  tool: DockTool
  active: boolean
  onActivate: () => void
  onClose: () => void
}) {
  const Icon = ICONS[tool.kind]

  return (
    <div
      onPointerDown={onActivate}
      className={cn(
        'flex h-7 max-w-56 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] transition-colors',
        active ? 'bg-raised text-text' : 'text-muted hover:bg-raised/60 hover:text-text',
      )}
    >
      <Icon className="size-3.5 shrink-0 text-faint" />
      <span className="truncate">{tool.title}</span>
      {tool.subtitle && <span className="shrink-0 truncate text-[11px] text-faint">{tool.subtitle}</span>}

      <button
        onClick={(event) => {
          event.stopPropagation()
          onClose()
        }}
        className="grid size-4 shrink-0 place-items-center rounded text-faint hover:bg-overlay hover:text-text"
      >
        <X className="size-3" />
      </button>
    </div>
  )
}

export function Dock() {
  const tools = useDock((state) => state.tools)
  const activeId = useDock((state) => state.activeId)
  const maximized = useDock((state) => state.maximized)
  const activate = useDock((state) => state.activate)
  const close = useDock((state) => state.close)
  const toggleMaximized = useDock((state) => state.toggleMaximized)

  const [height, setHeight] = usePanelSize('dock', BOUNDS)

  if (tools.length === 0) return null

  return (
    <section
      style={maximized ? undefined : { height }}
      className={cn(
        'relative flex shrink-0 flex-col border-t border-line bg-surface',
        maximized ? 'min-h-0 flex-1' : 'max-h-[80vh]',
      )}
    >
      {!maximized && <Resizer edge="top" onResize={setHeight} />}

      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-2">
        {tools.map((tool) => (
          <Tab
            key={tool.id}
            tool={tool}
            active={tool.id === activeId}
            onActivate={() => activate(tool.id)}
            onClose={() => close(tool.id)}
          />
        ))}

        <button
          onClick={toggleMaximized}
          title={maximized ? 'Restore the panel' : 'Maximise the panel'}
          className="ml-auto grid size-6 shrink-0 place-items-center rounded text-muted transition-colors hover:bg-raised hover:text-text"
        >
          {maximized ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </button>
      </div>

      {/* Inactive tools stay mounted so switching tabs never restarts a stream. */}
      {tools.map((tool) => (
        <div
          key={tool.id}
          className={cn('min-h-0 flex-1 flex-col', tool.id === activeId ? 'flex' : 'hidden')}
        >
          {tool.kind === 'logs' && <LogPanel target={tool.ref} />}
          {tool.kind === 'shell' && <TerminalPanel target={tool.ref} node={tool.node} />}
        </div>
      ))}
    </section>
  )
}
