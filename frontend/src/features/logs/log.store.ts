import { create } from 'zustand'
import { EventsOn } from '@bindings/runtime/runtime'
import { LogBuffer } from './log.buffer'
import { startLogStream, stopLogStream } from './log.api'
import { targetKey, type LogChunk, type LogOptions, type LogTarget } from './log.types'

export type LogSession = {
  buffer: LogBuffer
  targets: LogTarget[]
  live: number
  error: string | null
  version: number
}

type LogState = {
  sessions: Record<string, LogSession>
}

export const useLogs = create<LogState>(() => ({ sessions: {} }))

const owners = new Map<string, { id: string; label: string }>()
let counter = 0

/** Prefix each line only when more than one stream feeds the same buffer. */
function labeller(targets: LogTarget[]): (target: LogTarget) => string {
  if (targets.length < 2) return () => ''
  if (new Set(targets.map((target) => target.pod)).size > 1) return targetKey
  return (target) => target.container
}

export async function openLogs(
  id: string,
  clusterId: string,
  targets: LogTarget[],
  opts: LogOptions,
  capacity: number,
) {
  stopStreams(id)

  const buffer = useLogs.getState().sessions[id]?.buffer ?? new LogBuffer(capacity)
  buffer.clear()
  buffer.capacity = capacity

  const label = labeller(targets)
  const started = targets.map((target) => {
    counter += 1
    const token = `${id}#${counter}`
    owners.set(token, { id, label: label(target) })
    return { token, target }
  })

  useLogs.setState((state) => ({
    sessions: {
      ...state.sessions,
      [id]: { buffer, targets, live: started.length, error: null, version: 0 },
    },
  }))

  await Promise.all(
    started.map(({ token, target }) =>
      startLogStream(token, clusterId, target, opts, receive).catch((error) =>
        receive({ token, lines: null, dropped: 0, done: true, error: String(error) }),
      ),
    ),
  )
}

export function closeLogs(id: string) {
  stopStreams(id)

  useLogs.setState((state) => {
    const sessions = { ...state.sessions }
    delete sessions[id]
    return { sessions }
  })
}

/** Publish a buffer mutation the store did not make itself (search, clear, capacity). */
export function touchLogs(id: string) {
  useLogs.setState((state) => {
    const session = state.sessions[id]
    if (!session) return state
    return { sessions: { ...state.sessions, [id]: { ...session, version: session.version + 1 } } }
  })
}

function stopStreams(id: string) {
  for (const [token, owner] of owners) {
    if (owner.id !== id) continue
    owners.delete(token)
    void stopLogStream(token).catch(() => {})
  }
}

let queue: LogChunk[] = []
let frame = 0

function receive(chunk: LogChunk) {
  queue.push(chunk)
  if (!frame) frame = requestAnimationFrame(drain)
}

function drain() {
  frame = 0
  const chunks = queue
  queue = []

  useLogs.setState((state) => {
    const sessions = { ...state.sessions }

    for (const chunk of chunks) {
      const owner = owners.get(chunk.token)
      const session = owner ? sessions[owner.id] : undefined
      if (!owner || !session) continue

      session.buffer.push(owner.label, chunk.lines ?? [], chunk.dropped)
      if (chunk.done) owners.delete(chunk.token)

      sessions[owner.id] = {
        ...session,
        live: session.live - (chunk.done ? 1 : 0),
        error: chunk.error ?? session.error,
        version: session.version + 1,
      }
    }
    return { sessions }
  })
}

export function subscribeLogEvents() {
  try {
    return EventsOn('log:chunk', receive)
  } catch {
    return () => {}
  }
}
