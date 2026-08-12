import { create } from 'zustand'
import { load, save } from '@/shared/lib/persist'
import { listFonts } from './settings.api'

export type Appearance = {
  /** '' means "whatever global.css picked". */
  sans: string
  mono: string
  size: number
}

const KEY = 'appearance'

export const SIZES = { min: 11, max: 18, step: 0.5 }

const DEFAULTS: Appearance = { sans: '', mono: '', size: 13 }

type AppearanceState = Appearance & {
  fonts: string[]
  update: (change: Partial<Appearance>) => void
  reset: () => void
  loadFonts: () => Promise<void>
}

const clamp = (size: number) =>
  Math.min(SIZES.max, Math.max(SIZES.min, Number(size) || DEFAULTS.size))

function stored(): Appearance {
  const saved = load<Partial<Appearance>>(KEY, {})
  return {
    sans: saved.sans ?? DEFAULTS.sans,
    mono: saved.mono ?? DEFAULTS.mono,
    size: clamp(saved.size ?? DEFAULTS.size),
  }
}

/** An empty family drops the override, so the stylesheet's stack comes back. */
function family(name: string, generic: string, property: string) {
  const style = document.documentElement.style
  if (name) style.setProperty(property, `"${name}", ${generic}`)
  else style.removeProperty(property)
}

function apply(appearance: Appearance) {
  document.documentElement.style.setProperty('--app-font-size', `${appearance.size}px`)
  family(appearance.sans, 'sans-serif', '--font-sans')
  family(appearance.mono, 'monospace', '--font-mono')
}

export const useAppearance = create<AppearanceState>((set, get) => ({
  ...stored(),
  fonts: [],

  update: (change) => {
    const { sans, mono, size } = { ...get(), ...change }
    const next: Appearance = { sans, mono, size: clamp(size) }

    apply(next)
    save(KEY, next)
    set(next)
  },

  reset: () => get().update(DEFAULTS),

  loadFonts: async () => {
    if (get().fonts.length > 0) return
    set({ fonts: await listFonts() })
  },
}))

apply(useAppearance.getState())
