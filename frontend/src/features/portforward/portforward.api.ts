import { List, Ports, Restore, Start, Stop } from '@bindings/go/app/PortForwardAPI'
import type { domain } from '@bindings/go/models'
import { useClusters } from '@/features/clusters/cluster.store'
import type { ResourceRef } from '@/features/resources/resource.types'
import type { ForwardPort, PortForward } from './portforward.types'

const offline = () => useClusters.getState().offline

// Offline there is no registry behind the bindings, so this map is the registry.
const fakes = new Map<string, PortForward>()
let fakeSeq = 0

export async function listForwards(): Promise<PortForward[]> {
  if (offline()) return [...fakes.values()]
  return (await List()) as PortForward[]
}

export async function listForwardPorts(ref: ResourceRef): Promise<ForwardPort[]> {
  if (offline()) return fixturePorts(ref)
  return (await Ports(ref as domain.ResourceRef)) as ForwardPort[]
}

export async function startForward(
  ref: ResourceRef,
  localPort: number,
  remotePort: number,
): Promise<PortForward> {
  if (offline()) {
    fakeSeq += 1
    const forward: PortForward = {
      id: `fixture-${fakeSeq}`,
      clusterId: ref.clusterId,
      namespace: ref.namespace,
      resource: ref.gvr.resource,
      name: ref.name,
      pod: ref.name,
      localPort: localPort || 30000 + fakeSeq,
      remotePort,
      status: 'active',
    }
    fakes.set(forward.id, forward)
    return forward
  }
  return (await Start(ref as domain.ResourceRef, localPort, remotePort)) as PortForward
}

/** Offline there is nothing persisted to bring back. */
export async function restoreForwards(clusterId: string): Promise<PortForward[]> {
  if (offline()) return []
  return (await Restore(clusterId)) as PortForward[]
}

export async function stopForward(id: string): Promise<void> {
  if (offline()) {
    fakes.delete(id)
    return
  }
  await Stop(id)
}

function fixturePorts(ref: ResourceRef): ForwardPort[] {
  if (ref.gvr.resource === 'services') {
    return [
      { name: 'http', port: 8080, protocol: 'TCP' },
      { name: 'metrics', port: 9090, protocol: 'TCP' },
    ]
  }
  return [{ name: 'http', port: 8080, protocol: 'TCP' }]
}
