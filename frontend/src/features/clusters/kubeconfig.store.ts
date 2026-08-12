import { create } from 'zustand'
import { Add, Import, List, Pick, Remove } from '@bindings/go/app/KubeconfigAPI'
import { useClusters } from './cluster.store'

export type KubeconfigFile = {
  path: string
  contexts: number
  removable: boolean
  error: string
}

type KubeconfigState = {
  files: KubeconfigFile[]
  error: string | null
  busy: boolean
  load: () => Promise<void>
  pick: () => Promise<string>
  add: (path: string) => Promise<boolean>
  paste: (content: string) => Promise<boolean>
  remove: (path: string) => Promise<void>
}

const DESKTOP_ONLY = 'Managing kubeconfigs needs the desktop app — the browser preview has no bridge.'

function reason(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function mutate(action: () => Promise<unknown>): Promise<boolean> {
  if (useClusters.getState().offline) {
    useKubeconfigs.setState({ error: DESKTOP_ONLY })
    return false
  }

  useKubeconfigs.setState({ busy: true, error: null })
  try {
    await action()
    await useKubeconfigs.getState().load()
    await useClusters.getState().load()
    return true
  } catch (error) {
    useKubeconfigs.setState({ error: reason(error) })
    return false
  } finally {
    useKubeconfigs.setState({ busy: false })
  }
}

export const useKubeconfigs = create<KubeconfigState>((set) => ({
  files: [],
  error: null,
  busy: false,

  load: async () => {
    if (useClusters.getState().offline) return
    try {
      set({ files: (await List()) as KubeconfigFile[] })
    } catch (error) {
      set({ error: reason(error) })
    }
  },

  pick: async () => {
    if (useClusters.getState().offline) {
      set({ error: DESKTOP_ONLY })
      return ''
    }
    try {
      return await Pick()
    } catch (error) {
      set({ error: reason(error) })
      return ''
    }
  },

  add: (path) => mutate(() => Add(path)),
  paste: (content) => mutate(() => Import(content)),
  remove: async (path) => {
    await mutate(() => Remove(path))
  },
}))
