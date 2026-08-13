import { Dir, Fonts, Reveal, Version } from '@bindings/go/app/SettingsAPI'
import { useClusters } from '@/features/clusters/cluster.store'

const offline = () => useClusters.getState().offline

// The browser preview has no bridge, so it gets the families every OS ships with.
const FIXTURE_FONTS = [
  'Arial',
  'Cascadia Mono',
  'Consolas',
  'Courier New',
  'Georgia',
  'Inter',
  'JetBrains Mono',
  'Segoe UI',
  'Tahoma',
  'Times New Roman',
  'Verdana',
]

export async function listFonts(): Promise<string[]> {
  if (offline()) return FIXTURE_FONTS
  try {
    return await Fonts()
  } catch {
    return FIXTURE_FONTS
  }
}

/** Where settings.json and the imported kubeconfigs live. */
export async function configDir(): Promise<string> {
  if (offline()) return ''
  try {
    return await Dir()
  } catch {
    return ''
  }
}

/** What wails.json calls the product version; `dev` when there is no bridge. */
export async function appVersion(): Promise<string> {
  try {
    return await Version()
  } catch {
    return 'dev'
  }
}

export async function revealPath(path: string): Promise<void> {
  if (offline()) return
  await Reveal(path)
}
