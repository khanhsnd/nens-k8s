import { fixtureObjects } from '@/features/resources/resource.fixtures'
import type { K8sObject, ResourceRef } from '@/features/resources/resource.types'
import type { ContainerRole, ContainerTarget } from './container.types'

function podsFor(ref: ResourceRef): K8sObject[] {
  const object = fixtureObjects(ref.gvr.resource).find((item) => item.metadata.uid === ref.uid)
  if (object?.kind === 'Pod') return [object]

  return fixtureObjects('pods')
    .filter((pod) => pod.metadata.namespace === ref.namespace)
    .slice(0, 3)
}

export function fixtureTargets(ref: ResourceRef): ContainerTarget[] {
  return podsFor(ref).flatMap((pod) => {
    const groups: Array<[ContainerRole, any[]]> = [
      ['init', pod.spec?.initContainers ?? []],
      ['app', pod.spec?.containers ?? []],
    ]

    return groups.flatMap(([role, containers]) =>
      containers.map((container: any) => {
        const status = (pod.status?.containerStatuses ?? []).find(
          (item: any) => item.name === container.name,
        )
        return {
          namespace: pod.metadata.namespace ?? '',
          pod: pod.metadata.name,
          container: container.name,
          role,
          state: role === 'init' ? 'terminated' : status?.state?.waiting ? 'waiting' : 'running',
          restarts: status?.restartCount ?? 0,
        }
      }),
    )
  })
}
