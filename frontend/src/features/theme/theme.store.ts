import { create } from 'zustand'
import { WindowSetDarkTheme, WindowSetLightTheme } from '@bindings/runtime/runtime'
import { load, save } from '@/shared/lib/persist'

export type Theme = 'light' | 'dark'

const KEY = 'theme'

type ThemeState = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggle: () => void
}

function initialTheme(): Theme {
  const stored = load<Theme | null>(KEY, null)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  save(KEY, theme)
  try {
    if (theme === 'dark') WindowSetDarkTheme()
    else WindowSetLightTheme()
  } catch {
    return
  }
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: initialTheme(),

  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },

  toggle: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
}))

applyTheme(useTheme.getState().theme)
