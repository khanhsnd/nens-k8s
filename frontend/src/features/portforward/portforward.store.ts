import { create } from 'zustand'
import { EventsOn } from '@bindings/runtime/runtime'
import type { ResourceRef } from '@/features/resources/resource.types'
import { notify } from '@/shared/ui/toast.store'
import { listForwards, restoreForwards, startForward, stopForward } from './portforward.api'
import { forwardTarget, type PortForward } from './portforward.types'

type ForwardState = {
  forwards: Record<string, PortForward>
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

/**
 * Every record that arrives without a caller watching for it lands here — nobody
 * is on the Port Forwarding tab when a tunnel breaks or a restore fails, so a
 * problem that is new raises a toast on its way into the store.
 */
export function absorb(forward: PortForward) {
  const previous = useForwards.getState().forwards[forward.id]

  if (forward.error && forward.error !== previous?.error) {
    const dead = forward.status === 'error'
    notify({
      tone: dead ? 'danger' : 'warn',
      title: `Port forward ${dead ? 'failed' : 'error'} — ${forwardTarget(forward)}`,
      detail: forward.error,
    })
  }
  useForwards.setState((state) => ({ forwards: apply(state.forwards, forward) }))
}

export const useForwards = create<ForwardState>((set) => ({
  forwards: {},

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
        for (const forward of await restoreForwards(clusterId)) absorb(forward)
      } catch (error) {
        notify({
          tone: 'danger',
          title: `Port forwards not restored — ${clusterId}`,
          detail: String(error),
        })
      }
    }
  },
}))

export function subscribeForwardEvents() {
  try {
    return EventsOn('forward:changed', absorb)
  } catch {
    return () => {}
  }
}
