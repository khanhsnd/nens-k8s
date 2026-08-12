import type { GVR } from '@/features/resources/resource.types'

/** One `additionalPrinterColumns` entry of a CRD. `priority > 0` is kubectl's wide tier. */
export type PrinterColumn = {
  name: string
  type: string
  jsonPath: string
  priority: number
  description?: string
}

/** One resource the connected cluster serves. `custom` is anything outside the built-in groups. */
export type ApiResource = {
  gvr: GVR
  kind: string
  namespaced: boolean
  custom: boolean
  verbs: string[]
  shortNames?: string[]
  columns?: PrinterColumn[]
}
