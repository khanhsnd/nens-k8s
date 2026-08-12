import { Copy, Square } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ResourceRef } from '@/features/resources/resource.types'
import { copyText } from '@/shared/lib/clipboard'
import { listForwardPorts } from './portforward.api'
import { ForwardStatusPill } from './portforward.columns'
import { useForwards } from './portforward.store'
import { forwardAddress, type ForwardPort, type PortForward } from './portforward.types'

function Live({ forward, onStop }: { forward: PortForward; onStop: () => void }) {
  return (
    <>
      <ForwardStatusPill forward={forward} />
      <span className="font-mono text-xs font-medium text-accent">
        {forward.status === 'active' ? forwardAddress(forward) : '…'}
      </span>
      <button
        title="Copy the local address"
        onClick={() => void copyText(forwardAddress(forward))}
        className="grid size-6 shrink-0 place-items-center rounded text-faint transition-colors hover:bg-overlay hover:text-accent"
      >
        <Copy className="size-3.5" />
      </button>
      <button
        title="Stop this forward"
        onClick={onStop}
        className="grid size-6 shrink-0 place-items-center rounded text-faint transition-colors hover:bg-danger/15 hover:text-danger"
      >
        <Square className="size-3.5" />
      </button>
    </>
  )
}

function Start({
  local,
  busy,
  onLocal,
  onStart,
}: {
  local: string
  busy: boolean
  onLocal: (value: string) => void
  onStart: () => void
}) {
  return (
    <>
      <input
        value={local}
        placeholder="auto"
        inputMode="numeric"
        title="Local port — empty picks a free one"
        onChange={(event) => onLocal(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && onStart()}
        className="w-14 shrink-0 rounded border border-line bg-surface px-1.5 py-0.5 text-center font-mono text-xs text-text outline-none focus:border-accent/60"
      />
      <button
        onClick={onStart}
        disabled={busy}
        className="shrink-0 rounded-md border border-accent/40 bg-accent-dim px-2 py-0.5 text-xs font-medium text-accent transition-colors hover:bg-accent hover:text-base disabled:opacity-40"
      >
        {busy ? 'Starting…' : 'Forward'}
      </button>
    </>
  )
}

export function ForwardPanel({ target }: { target: ResourceRef }) {
  const forwards = useForwards((state) => state.forwards)
  const start = useForwards((state) => state.start)
  const stop = useForwards((state) => state.stop)

  const [ports, setPorts] = useState<ForwardPort[]>([])
  const [locals, setLocals] = useState<Record<string, string>>({})
  const [remote, setRemote] = useState('')
  const [busy, setBusy] = useState<number | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setPorts([])

    listForwardPorts(target)
      .then((found) => live && setPorts(found))
      .catch((error) => live && setFailed(String(error)))

    return () => {
      live = false
    }
  }, [target])

  const mine = useMemo(
    () =>
      Object.values(forwards).filter(
        (forward) =>
          forward.clusterId === target.clusterId &&
          forward.namespace === target.namespace &&
          forward.resource === target.gvr.resource &&
          forward.name === target.name,
      ),
    [forwards, target],
  )

  const forward = async (port: number, local: string) => {
    setBusy(port)
    setFailed(null)
    try {
      await start(target, Number(local) || 0, port)
      setRemote('')
    } catch (error) {
      setFailed(String(error))
    } finally {
      setBusy(null)
    }
  }

  // Anything forwarded on a port the spec does not declare still belongs here.
  const extra = mine.filter((item) => !ports.some((port) => port.port === item.remotePort))
  const rows = [
    ...ports.map((port) => ({ port: port.port, label: port.name, protocol: port.protocol })),
    ...extra.map((item) => ({ port: item.remotePort, label: '', protocol: '' })),
  ]

  return (
    <div className="mt-4 space-y-1.5">
      <div className="text-xs uppercase tracking-wide text-faint">Port forwarding</div>

      {rows.map((row) => {
        const live = mine.find((item) => item.remotePort === row.port)

        return (
          <div
            key={row.port}
            className="flex items-center gap-2 rounded-md border border-line bg-base px-2 py-1.5 text-sm"
          >
            <span className="min-w-0 flex-1 truncate">
              <span className="font-mono font-medium text-ok">{row.port}</span>
              {row.label && <span className="ml-1.5 text-muted">{row.label}</span>}
              {row.protocol && <span className="ml-1 text-faint">{row.protocol}</span>}
            </span>

            {live ? (
              <Live forward={live} onStop={() => void stop(live.id)} />
            ) : (
              <Start
                local={locals[row.port] ?? ''}
                busy={busy === row.port}
                onLocal={(value) => setLocals((current) => ({ ...current, [row.port]: value }))}
                onStart={() => void forward(row.port, locals[row.port] ?? '')}
              />
            )}
          </div>
        )
      })}

      <div className="flex items-center gap-2 rounded-md border border-dashed border-line px-2 py-1.5 text-sm">
        <input
          value={remote}
          placeholder={rows.length === 0 ? 'no declared port — enter one' : 'another port'}
          inputMode="numeric"
          onChange={(event) => setRemote(event.target.value)}
          onKeyDown={(event) =>
            event.key === 'Enter' && Number(remote) > 0 && void forward(Number(remote), '')
          }
          className="min-w-0 flex-1 bg-transparent font-mono text-xs text-text outline-none placeholder:font-sans placeholder:text-faint"
        />
        <Start
          local={locals.custom ?? ''}
          busy={busy === Number(remote)}
          onLocal={(value) => setLocals((current) => ({ ...current, custom: value }))}
          onStart={() =>
            Number(remote) > 0 && void forward(Number(remote), locals.custom ?? '')
          }
        />
      </div>

      {failed && <p className="font-mono text-xs text-danger">{failed}</p>}
    </div>
  )
}
