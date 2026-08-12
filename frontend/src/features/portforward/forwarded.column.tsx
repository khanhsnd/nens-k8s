import { useClusters } from '@/features/clusters/cluster.store'
import type { K8sObject, ResourceColumn } from '@/features/resources/resource.types'
import { Pill } from '@/shared/ui/Badge'
import { FORWARD_TONES } from './portforward.columns'
import { useForwards } from './portforward.store'
import type { PortForward } from './portforward.types'

function matches(
  forwards: Record<string, PortForward>,
  clusterId: string | null,
  resource: string,
  object: K8sObject,
): PortForward[] {
  return Object.values(forwards)
    .filter(
      (forward) =>
        forward.clusterId === clusterId &&
        forward.resource === resource &&
        forward.name === object.metadata.name &&
        forward.namespace === (object.metadata.namespace ?? ''),
    )
    .sort((a, b) => a.remotePort - b.remotePort)
}

const label = (forward: PortForward) =>
  forward.status === 'active'
    ? `${forward.remotePort}→${forward.localPort}`
    : `${forward.remotePort}→…`

function Forwarded({ object, resource }: { object: K8sObject; resource: string }) {
  const forwards = useForwards((state) => state.forwards)
  const clusterId = useClusters((state) => state.activeId)

  const mine = matches(forwards, clusterId, resource, object)
  if (mine.length === 0) return <span className="text-faint">—</span>

  return (
    <span className="flex items-center gap-1">
      {mine.map((forward) => (
        <Pill
          key={forward.id}
          mono
          tone={FORWARD_TONES[forward.status]}
          title={`localhost:${forward.localPort} → ${forward.pod}:${forward.remotePort}`}
        >
          {label(forward)}
        </Pill>
      ))}
    </span>
  )
}

/** Which of this object's ports are forwarded right now — live from the registry. */
export function forwardedColumn(resource: string): ResourceColumn {
  return {
    key: 'forwarded',
    label: 'Forwarded',
    min: 130,
    grow: 0.7,
    text: (row) =>
      matches(useForwards.getState().forwards, useClusters.getState().activeId, resource, row)
        .map(label)
        .join(' '),
    cell: (row) => <Forwarded object={row} resource={resource} />,
  }
}
