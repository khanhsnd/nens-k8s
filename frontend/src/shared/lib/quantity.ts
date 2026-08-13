const SUFFIXES: Record<string, number> = {
  '': 1,
  n: 1e-9,
  u: 1e-6,
  m: 1e-3,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
  Pi: 1024 ** 5,
  Ei: 1024 ** 6,
}

/**
 * A Kubernetes quantity (`"3900m"`, `"7847356Ki"`) as a plain number, in the
 * unit the suffix implies — cores for CPU, bytes for memory.
 *
 * `status.capacity` and `status.allocatable` are the only quantities the
 * frontend ever meets: usage arrives from the backend already parsed, which is
 * why this stays a reader and never has to format one back.
 */
export function quantity(value?: string): number {
  const match = /^([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)(.*)$/.exec(value?.trim() ?? '')
  const scale = match ? SUFFIXES[match[2]] : undefined
  return scale === undefined ? 0 : Number(match?.[1]) * scale
}

/** CPU quantities are cores; everything that compares them works in millicores. */
export const millicoresOf = (value?: string): number => quantity(value) * 1000
