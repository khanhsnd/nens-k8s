import { create } from 'zustand'
import { EventsOn } from '@bindings/runtime/runtime'
import type { ResourceRef } from '@/features/resources/resource.types'
import { listForwards, restoreForwards, startForward, stopForward } from './portforward.api'
import type { PortForward } from './portforward.types'

type ForwardState = {
  forwards: Record<string, PortForward>
  error: string | null
  load: () => Promise<void>
  start: (ref: ResourceRef, localPort: number, remotePort: number) => Promise<PortForward>
  stop: (id: string) => Promise<void>
  /** Restores the saved forwards of every cluster that is connected, once each. */
  sync: (connected: string[]) => Promise<void>
}

// Restoring follows connections, not renders: a cluster that reconnects gets its
// forwards back, and a forward the user stopped is already gone from the store.
const restored = new Set<string>()

/** A forward that has stopped is gone: the registry keeps only live ones. */
function apply(forwards: Record<string, PortForward>, forward: PortForward) {
  const next = { ...forwards }
  if (forward.status === 'stopped') delete next[forward.id]
  else next[forward.id] = forward
  return next
}

export const useForwards = create<ForwardState>((set) => ({
  forwards: {},
  error: null,

  load: async () => {
    const listed = await listForwards()
    set({ forwards: Object.fromEntries(listed.map((forward) => [forward.id, forward])) })
  },

  start: async (ref, localPort, remotePort) => {
    const forward = await startForward(ref, localPort, remotePort)
    set((state) => ({ forwards: apply(state.forwards, forward) }))
    return forward
  },

  stop: async (id) => {
    await stopForward(id)
    set((state) => {
      const forwards = { ...state.forwards }
      delete forwards[id]
      return { forwards }
    })
  },

  sync: async (connected) => {
    for (const clusterId of restored) {
      if (!connected.includes(clusterId)) restored.delete(clusterId)
    }

    for (const clusterId of connected) {
      if (restored.has(clusterId)) continue
      restored.add(clusterId)

      try {
        const back = await restoreForwards(clusterId)
        set((state) => ({
          forwards: back.reduce(apply, state.forwards),
          error: null,
        }))
      } catch (error) {
        set({ error: String(error) })
      }
    }
  },
}))

export function subscribeForwardEvents() {
  try {
    return EventsOn('forward:changed', (forward: PortForward) => {
      useForwards.setState((state) => ({ forwards: apply(state.forwards, forward) }))
    })
  } catch {
    return () => {}
  }
}
