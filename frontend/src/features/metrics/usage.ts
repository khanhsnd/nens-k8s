import type { Kind } from '@/features/resources/kinds'
import type { K8sObject } from '@/features/resources/resource.types'
import { EMPTY_USAGE, useMetrics, usageKey } from './metrics.store'
import type { Usage } from './metrics.types'

/** The usage index of a kind that has one, and nothing for a kind that has not. */
export function useUsage(kind: Kind | null): Map<string, Usage> {
  return useMetrics((state) => (kind?.metrics ? state.usage : EMPTY_USAGE))
}

/**
 * A row carrying its own usage, so a column reads `row.metrics` and knows
 * nothing about where metrics come from. A row with no sample is returned
 * as it was, which keeps the whole table stable while metrics are missing.
 */
export function withUsage(usage: Map<string, Usage>, row: K8sObject): K8sObject {
  const sample = usage.get(usageKey(row.metadata.namespace, row.metadata.name))
  return sample ? { ...row, metrics: sample } : row
}
