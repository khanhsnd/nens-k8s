import { create } from 'zustand'
import { EventsOn } from '@bindings/runtime/runtime'
import type { ResourceRef } from '@/features/resources/resource.types'
import { listForwards, startForward, stopForward } from './portforward.api'
import type { PortForward } from './portforward.types'

type ForwardState = {
  forwards: Record<string, PortForward>
  load: () => Promise<void>
  start: (ref: ResourceRef, localPort: number, remotePort: number) => Promise<PortForward>
  stop: (id: string) => Promise<void>
}

/** A forward that has stopped is gone: the registry keeps only live ones. */
function apply(forwards: Record<string, PortForward>, forward: PortForward) {
  const next = { ...forwards }
  if (forward.status === 'stopped') delete next[forward.id]
  else next[forward.id] = forward
  return next
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
