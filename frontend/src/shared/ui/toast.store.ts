import { create } from 'zustand'
import { report } from '@/shared/lib/report'
import type { Tone } from './Badge'

export type Toast = {
  id: number
  tone: Tone
  title: string
  detail?: string
}

type ToastState = {
  toasts: Toast[]
  dismiss: (id: number) => void
}

const LIMIT = 4
const LINGER = 6000

let seq = 0

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))

/**
 * A failure stays until it is dismissed, because the point of showing it is that
 * the detail can be read and copied; anything else fades on its own.
 */
export function notify(toast: Omit<Toast, 'id'>) {
  seq += 1
  const entry = { ...toast, id: seq }

  if (entry.tone === 'danger') report(entry.title, entry.detail ?? '')
  useToasts.setState((state) => ({ toasts: [...state.toasts, entry].slice(-LIMIT) }))

  if (entry.tone !== 'danger') {
    setTimeout(() => useToasts.getState().dismiss(entry.id), LINGER)
  }
}
