import { create } from 'zustand'

type EditorState = {
  dirty: boolean
  pending: (() => void) | null
  setDirty: (dirty: boolean) => void
  guard: (action: () => void) => void
  discard: () => void
  keep: () => void
}

export const useEditorGuard = create<EditorState>((set, get) => ({
  dirty: false,
  pending: null,

  setDirty: (dirty) => set({ dirty }),

  guard: (action) => {
    if (get().dirty) set({ pending: action })
    else action()
  },

  discard: () => {
    const action = get().pending
    set({ dirty: false, pending: null })
    action?.()
  },

  keep: () => set({ pending: null }),
}))
