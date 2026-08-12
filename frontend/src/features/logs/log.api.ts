import { Start, Stop, Targets } from '@bindings/go/app/LogAPI'
import type { domain } from '@bindings/go/models'
import { useClusters } from '@/features/clusters/cluster.store'
import type { ResourceRef } from '@/features/resources/resource.types'
import { fixtureStream, fixtureTargets } from './log.fixtures'
import type { LogChunk, LogOptions, LogTarget } from './log.types'

const offline = () => useClusters.getState().offline

// Fixture streams have no backend to cancel, so their stoppers live here.
const fakes = new Map<string, () => void>()

export async function listLogTargets(ref: ResourceRef): Promise<LogTarget[]> {
  if (offline()) return fixtureTargets(ref)
  return (await Targets(ref as domain.ResourceRef)) as LogTarget[]
}

export async function startLogStream(
  token: string,
  clusterId: string,
  target: LogTarget,
  opts: LogOptions,
  sink: (chunk: LogChunk) => void,
): Promise<void> {
  if (offline()) {
    fakes.set(token, fixtureStream(token, target, opts, sink))
    return
  }
  await Start(token, clusterId, target as domain.LogTarget, opts as domain.LogOptions)
}

export async function stopLogStream(token: string): Promise<void> {
  const stop = fakes.get(token)
  if (stop) {
    fakes.delete(token)
    stop()
    return
  }
  await Stop(token)
}
