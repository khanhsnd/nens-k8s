import { Refresh, Resources } from '@bindings/go/app/DiscoveryAPI'
import { useClusters } from '@/features/clusters/cluster.store'
import { FIXTURE_RESOURCES } from './discovery.fixtures'
import type { ApiResource } from './discovery.types'

export async function listApiResources(clusterId: string): Promise<ApiResource[]> {
  if (useClusters.getState().offline) return FIXTURE_RESOURCES
  return (await Resources(clusterId)) as ApiResource[]
}

export async function refreshApiResources(clusterId: string): Promise<ApiResource[]> {
  if (useClusters.getState().offline) return FIXTURE_RESOURCES
  return (await Refresh(clusterId)) as ApiResource[]
}
