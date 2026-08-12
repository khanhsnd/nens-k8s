import { NodeShell, Resize, Send, Start, Stop } from '@bindings/go/app/ExecAPI'
import type { domain } from '@bindings/go/models'
import { useClusters } from '@/features/clusters/cluster.store'
import type { ContainerTarget } from '@/features/containers/container.types'
import { fixtureShell, type FixtureShell } from './exec.fixtures'
import type { ExecChunk, ExecOptions } from './exec.types'

const offline = () => useClusters.getState().offline

// Fixture shells have no backend to talk to, so their input and stopper live here.
const fakes = new Map<string, FixtureShell>()

export async function startExec(
  token: string,
  clusterId: string,
  target: ContainerTarget,
  opts: ExecOptions,
  sink: (chunk: ExecChunk) => void,
): Promise<void> {
  if (offline()) {
    fakes.set(token, fixtureShell(token, target.container, sink))
    return
  }
  await Start(token, clusterId, target as domain.ContainerTarget, opts as domain.ExecOptions)
}

export async function startNodeShell(
  token: string,
  clusterId: string,
  node: string,
  opts: ExecOptions,
  sink: (chunk: ExecChunk) => void,
): Promise<void> {
  if (offline()) {
    fakes.set(token, fixtureShell(token, node, sink))
    return
  }
  await NodeShell(token, clusterId, node, opts as domain.ExecOptions)
}

export async function sendExec(token: string, data: string): Promise<void> {
  const fake = fakes.get(token)
  if (fake) return fake.input(data)
  await Send(token, data)
}

export async function resizeExec(token: string, cols: number, rows: number): Promise<void> {
  if (fakes.has(token)) return
  await Resize(token, cols, rows)
}

export async function stopExec(token: string): Promise<void> {
  const fake = fakes.get(token)
  if (fake) {
    fakes.delete(token)
    fake.stop()
    return
  }
  await Stop(token)
}
