const UNITS: Array<[number, string]> = [
  [86400, 'd'],
  [3600, 'h'],
  [60, 'm'],
  [1, 's'],
]

export function age(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
  for (const [size, suffix] of UNITS) {
    if (seconds >= size) return `${Math.floor(seconds / size)}${suffix}`
  }
  return '0s'
}

export function percent(value: number, total: number): string {
  if (total <= 0) return '—'
  return `${Math.round((value / total) * 100)}%`
}

/** Millicores, the unit `kubectl top` prints. */
export const millicores = (value: number): string => `${Math.round(value)}m`

/** Whole cores — a cluster-wide total is unreadable in millicores. */
export const cores = (value: number): string =>
  `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)} cores`

const SIZES = ['B', 'Ki', 'Mi', 'Gi', 'Ti', 'Pi']

export function bytes(value: number): string {
  let scaled = value
  let size = 0
  while (scaled >= 1024 && size < SIZES.length - 1) {
    scaled /= 1024
    size += 1
  }
  return `${scaled < 10 && size > 0 ? scaled.toFixed(1) : Math.round(scaled)}${SIZES[size]}`
}
