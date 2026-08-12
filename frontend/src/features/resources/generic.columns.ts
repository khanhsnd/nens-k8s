import type { PrinterColumn } from '@/features/discovery/discovery.types'
import { age } from '@/shared/lib/format'
import { readPath } from '@/shared/lib/jsonpath'
import { AGE_COLUMN, NAME_COLUMN, NAMESPACE_COLUMN } from './common.columns'
import type { ResourceColumn } from './resource.types'

/** Name and Age are already the first and last column of every table. */
const OWNED = new Set(['name', 'age'])

function render(value: unknown, type: string): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.map((item) => render(item, type)).join(', ')
  if (type === 'date' && typeof value === 'string') return age(value)
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function printerColumn(printer: PrinterColumn): ResourceColumn {
  const date = printer.type === 'date'

  return {
    key: `printer:${printer.name.toLowerCase().replace(/\W+/g, '-')}`,
    label: printer.name,
    min: date ? 64 : 120,
    grow: date ? 0.3 : 0.8,
    // kubectl's wide tier: the column exists, it just does not ship ticked.
    hidden: printer.priority > 0,
    text: (row) => render(readPath(row, printer.jsonPath), printer.type),
  }
}

/** What a kind with no columns file of its own renders: identity plus whatever the CRD prints. */
export function genericColumns(
  namespaced: boolean,
  printers: PrinterColumn[] = [],
): ResourceColumn[] {
  return [
    NAME_COLUMN,
    ...(namespaced ? [NAMESPACE_COLUMN] : []),
    ...printers.filter((printer) => !OWNED.has(printer.name.toLowerCase())).map(printerColumn),
    AGE_COLUMN,
  ]
}
