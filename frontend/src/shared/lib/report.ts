import { LogError } from '@bindings/runtime/runtime'

function detail(error: unknown) {
  if (error instanceof Error) return error.stack ?? `${error.name}: ${error.message}`
  return String(error)
}

export function report(scope: string, error: unknown) {
  console.error(`[${scope}]`, error)
  try {
    LogError(`${scope}: ${detail(error)}`)
  } catch {
    return
  }
}

export function watchForCrashes() {
  window.addEventListener('error', (e) => report('window', e.error ?? e.message))
  window.addEventListener('unhandledrejection', (e) => report('promise', e.reason))
}
