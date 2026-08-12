import { create } from 'zustand'
import { EventsOn } from '@bindings/runtime/runtime'
import type { ContainerTarget } from '@/features/containers/container.types'
import { decodeBase64 } from '@/shared/lib/base64'
import { resizeExec, sendExec, startExec, startNodeShell, stopExec } from './exec.api'
import type { ExecChunk, ExecOptions } from './exec.types'

export type ExecStatus = 'starting' | 'live' | 'ended'

export type ExecSession = {
  status: ExecStatus
  error: string | null
}

type ExecState = {
  sessions: Record<string, ExecSession>
}

export const useShells = create<ExecState>(() => ({ sessions: {} }))

// The panel owns the terminal, so a session is a token pointing at its writer.
const writers = new Map<string, { id: string; write: (bytes: Uint8Array) => void }>()
const attached = new Map<string, string>()
let counter = 0

type Attach = {
  id: string
  clusterId: string
  opts: ExecOptions
  write: (bytes: Uint8Array) => void
  target?: ContainerTarget
  node?: string
}

export async function openShell({ id, clusterId, opts, write, target, node }: Attach) {
  detach(id)

  counter += 1
  const token = `${id}#${counter}`
  attached.set(id, token)
  writers.set(token, { id, write })
  patch(id, { status: 'starting', error: null })

  try {
    if (node) await startNodeShell(token, clusterId, node, opts, receive)
    else if (target) await startExec(token, clusterId, target, opts, receive)
    else throw new Error('nothing to attach to')

    // A shell that already failed has published its done chunk by now.
    if (useShells.getState().sessions[id]?.status === 'starting') patch(id, { status: 'live' })
  } catch (error) {
    writers.delete(token)
    attached.delete(id)
    patch(id, { status: 'ended', error: String(error) })
  }
}

export function closeShell(id: string) {
  detach(id)

  useShells.setState((state) => {
    const sessions = { ...state.sessions }
    delete sessions[id]
    return { sessions }
  })
}

export function sendInput(id: string, data: string) {
  const token = attached.get(id)
  if (token) void sendExec(token, data).catch(() => {})
}

export function resizeShell(id: string, cols: number, rows: number) {
  const token = attached.get(id)
  if (token) void resizeExec(token, cols, rows).catch(() => {})
}

function detach(id: string) {
  const token = attached.get(id)
  if (!token) return

  attached.delete(id)
  writers.delete(token)
  void stopExec(token).catch(() => {})
}

function patch(id: string, changes: Partial<ExecSession>) {
  useShells.setState((state) => ({
    sessions: {
      ...state.sessions,
      [id]: { ...(state.sessions[id] ?? { status: 'starting', error: null }), ...changes },
    },
  }))
}

// Terminal output goes straight to xterm: the backend already batches it per
// frame, and xterm has its own write queue.
function receive(chunk: ExecChunk) {
  const writer = writers.get(chunk.token)
  if (!writer) return

  if (chunk.data) writer.write(decodeBase64(chunk.data))
  if (!chunk.done) return

  writers.delete(chunk.token)
  if (attached.get(writer.id) === chunk.token) attached.delete(writer.id)
  patch(writer.id, { status: 'ended', error: chunk.error ?? null })
}

export function subscribeExecEvents() {
  try {
    return EventsOn('exec:data', receive)
  } catch {
    return () => {}
  }
}
