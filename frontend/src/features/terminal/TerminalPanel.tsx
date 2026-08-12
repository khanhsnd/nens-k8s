import '@xterm/xterm/css/xterm.css'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal, type ITheme } from '@xterm/xterm'
import { Copy, Eraser, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { listContainers } from '@/features/containers/container.api'
import { targetKey, type ContainerTarget } from '@/features/containers/container.types'
import type { ResourceRef } from '@/features/resources/resource.types'
import { useTheme } from '@/features/theme/theme.store'
import { copyText } from '@/shared/lib/clipboard'
import { SHELLS } from './exec.types'
import { closeShell, openShell, resizeShell, sendInput, useShells } from './terminal.store'

const SCROLLBACK = 5000

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function terminalTheme(): ITheme {
  return {
    background: token('--color-base'),
    foreground: token('--color-text'),
    cursor: token('--color-accent'),
    cursorAccent: token('--color-base'),
    selectionBackground: token('--color-accent-dim'),
    black: token('--color-faint'),
    red: token('--color-danger'),
    green: token('--color-ok'),
    yellow: token('--color-warn'),
    blue: token('--color-accent'),
    magenta: token('--color-info'),
    cyan: token('--color-info'),
    white: token('--color-muted'),
    brightBlack: token('--color-faint'),
    brightRed: token('--color-danger'),
    brightGreen: token('--color-ok'),
    brightYellow: token('--color-warn'),
    brightBlue: token('--color-accent'),
    brightMagenta: token('--color-info'),
    brightCyan: token('--color-info'),
    brightWhite: token('--color-text'),
  }
}

/** The first running app container is what a shell almost always wants. */
function defaultContainer(targets: ContainerTarget[]): string {
  const running = targets.find((item) => item.role === 'app' && item.state === 'running')
  return targetKey(running ?? targets.find((item) => item.role === 'app') ?? targets[0])
}

function Choice({
  value,
  options,
  title,
  onChange,
}: {
  value: string
  options: ReadonlyArray<readonly [string, string]>
  title: string
  onChange: (value: string) => void
}) {
  return (
    <select
      value={value}
      title={title}
      onChange={(event) => onChange(event.target.value)}
      className="max-w-56 rounded border border-line bg-base px-1.5 py-1 text-[11px] text-muted outline-none transition-colors hover:text-text focus:border-accent/60"
    >
      {options.map(([option, label]) => (
        <option key={option} value={option}>
          {label}
        </option>
      ))}
    </select>
  )
}

function Action({
  icon: Icon,
  title,
  onClick,
}: {
  icon: typeof Copy
  title: string
  onClick: () => void
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="grid size-6 shrink-0 place-items-center rounded text-muted transition-colors hover:bg-raised hover:text-text"
    >
      <Icon className="size-3.5" />
    </button>
  )
}

export function TerminalPanel({ target, node }: { target: ResourceRef; node?: string }) {
  const id = `shell:${target.uid}`
  const session = useShells((state) => state.sessions[id])
  const theme = useTheme((state) => state.theme)

  const [targets, setTargets] = useState<ContainerTarget[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [container, setContainer] = useState('')
  const [shell, setShell] = useState(SHELLS[0][0])
  const [attempt, setAttempt] = useState(0)

  const host = useRef<HTMLDivElement>(null)
  const term = useRef<Terminal | null>(null)

  useEffect(() => {
    const terminal = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      fontFamily: token('--font-mono') || 'monospace',
      fontSize: 12,
      lineHeight: 1.2,
      scrollback: SCROLLBACK,
      theme: terminalTheme(),
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(host.current!)
    terminal.onData((data) => sendInput(id, data))
    term.current = terminal

    const resize = () => {
      fit.fit()
      resizeShell(id, terminal.cols, terminal.rows)
    }
    resize()

    const observer = new ResizeObserver(resize)
    observer.observe(host.current!)

    return () => {
      observer.disconnect()
      terminal.dispose()
      term.current = null
    }
  }, [id])

  useEffect(() => {
    if (term.current) term.current.options.theme = terminalTheme()
  }, [theme])

  useEffect(() => () => closeShell(id), [id])

  useEffect(() => {
    if (node) return

    let live = true
    setTargets(null)
    setFailed(null)

    listContainers(target)
      .then((found) => {
        if (!live) return
        setTargets(found)
        if (found.length > 0) setContainer(defaultContainer(found))
      })
      .catch((error) => live && setFailed(String(error)))

    return () => {
      live = false
    }
  }, [target, node])

  const chosen = useMemo(
    () => (targets ?? []).find((item) => targetKey(item) === container),
    [targets, container],
  )

  useEffect(() => {
    const terminal = term.current
    if (!terminal || (!node && !chosen)) return

    terminal.reset()
    void openShell({
      id,
      clusterId: target.clusterId,
      opts: {
        command: node ? [] : [shell],
        tty: true,
        cols: terminal.cols,
        rows: terminal.rows,
      },
      write: (bytes) => terminal.write(bytes),
      target: chosen,
      node,
    })
    terminal.focus()
    // `chosen` is rebuilt whenever the container list reloads; the key is what differs.
  }, [id, target.clusterId, node, container, shell, attempt])

  const containers = (targets ?? [])
    .filter((item) => item.role !== 'init')
    .map((item) => [targetKey(item), `${item.container} · ${item.state}`] as const)

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-base">
      <div className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-1.5">
        {node ? (
          <span className="font-mono text-[11px] text-muted">node/{node}</span>
        ) : (
          <Choice
            value={container}
            options={containers}
            title="Container to attach to"
            onChange={setContainer}
          />
        )}
        <Choice value={shell} options={SHELLS} title="Shell to run" onChange={setShell} />

        <span className="ml-auto flex items-center gap-1">
          <Action
            icon={RefreshCw}
            title="Reconnect"
            onClick={() => setAttempt((count) => count + 1)}
          />
          <Action icon={Eraser} title="Clear the screen" onClick={() => term.current?.clear()} />
          <Action
            icon={Copy}
            title="Copy the selection"
            onClick={() => void copyText(term.current?.getSelection() ?? '')}
          />
        </span>
      </div>

      {failed && (
        <div className="shrink-0 border-b border-line bg-raised px-3 py-1.5 font-mono text-[11px] text-danger">
          {failed}
        </div>
      )}

      <div ref={host} className="min-h-0 flex-1 overflow-hidden px-2 py-1" />

      <div className="flex shrink-0 items-center gap-3 border-t border-line bg-surface px-3 py-1 text-[11px] text-faint">
        <span className="truncate font-mono">
          {node ? `nsenter on ${node}` : (chosen ? `${chosen.pod}/${chosen.container}` : '—')}
        </span>
        {session?.error && <span className="truncate text-danger">{session.error}</span>}
        <span className="ml-auto shrink-0">
          {session?.status === 'live'
            ? 'attached'
            : session?.status === 'starting'
              ? 'attaching…'
              : 'session closed'}
        </span>
      </div>
    </div>
  )
}
