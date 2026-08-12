import { Targets } from '@bindings/go/app/ContainerAPI'
import type { domain } from '@bindings/go/models'
import { useClusters } from '@/features/clusters/cluster.store'
import type { ResourceRef } from '@/features/resources/resource.types'
import { fixtureTargets } from './container.fixtures'
import type { ContainerTarget } from './container.types'

export async function listContainers(ref: ResourceRef): Promise<ContainerTarget[]> {
  if (useClusters.getState().offline) return fixtureTargets(ref)
  return (await Targets(ref as domain.ResourceRef)) as ContainerTarget[]
}
