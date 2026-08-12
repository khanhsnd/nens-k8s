// The subset of JSONPath a CRD's `additionalPrinterColumns` actually uses:
// dotted fields, numeric indexes, bracketed keys and the `[?(@.a=="b")]`
// filter that every operator writes to pick a condition out of `.status`.
const SEGMENT =
  /\.([\w-]+)|\['([^']*)'\]|\["([^"]*)"\]|\[(\d+)\]|\[\?\(@\.([\w.-]+)\s*==\s*["']([^"']*)["']\)\]/g

export function readPath(source: unknown, path: string): unknown {
  const normalized = path.startsWith('.') || path.startsWith('[') ? path : `.${path}`
  let value: any = source

  for (const [, field, single, double, index, key, expected] of normalized.matchAll(SEGMENT)) {
    if (value === null || value === undefined) return undefined

    if (index !== undefined) value = value[Number(index)]
    else if (key !== undefined) {
      value = (Array.isArray(value) ? value : []).find(
        (item) => String(readPath(item, key)) === expected,
      )
    } else value = value[field ?? single ?? double]
  }
  return value
}
