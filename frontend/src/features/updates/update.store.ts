import { create } from 'zustand'
import { checkForUpdate, installUpdate, openReleasePage } from './update.api'
import type { UpdateStatus } from './update.types'

type UpdateState = {
  status: UpdateStatus | null
  checking: boolean
  installing: boolean
  error: string | null
  check: () => Promise<void>
  install: () => Promise<void>
  openRelease: () => Promise<void>
}

/**
 * Nothing polls. The check runs when the settings dialog opens and when the user
 * asks again, and a development build never reaches the network — a local tree
 * must not offer to replace itself with a published build.
 */
export const useUpdates = create<UpdateState>((set) => ({
  status: null,
  checking: false,
  installing: false,
  error: null,

  check: async () => {
    set({ checking: true, error: null })
    try {
      set({ status: await checkForUpdate(), checking: false })
    } catch (error) {
      set({ checking: false, error: String(error) })
    }
  },

  // Install quits the app when the installer starts, so nothing here has to
  // clear `installing` on the way out.
  install: async () => {
    set({ installing: true, error: null })
    try {
      await installUpdate()
    } catch (error) {
      set({ installing: false, error: String(error) })
    }
  },

  openRelease: async () => {
    try {
      await openReleasePage()
    } catch (error) {
      set({ error: String(error) })
    }
  },
}))
