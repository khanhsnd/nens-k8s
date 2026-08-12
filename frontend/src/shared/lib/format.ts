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
