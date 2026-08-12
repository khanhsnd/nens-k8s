import { fixtureObjects } from '@/features/resources/resource.fixtures'
import type { K8sObject, ResourceRef } from '@/features/resources/resource.types'
import type { ContainerRole, LogChunk, LogOptions, LogTarget } from './log.types'

// What "tail: all" means offline — enough to prove the buffer holds up.
const BURST = 50_000
const TICK = 250
const PER_TICK = 6

const LEVELS = ['INFO', 'INFO', 'INFO', 'INFO', 'DEBUG', 'WARN', 'ERROR']
const MESSAGES = [
  'GET /v1/accounts/%s 200 in %dms',
  'POST /v1/payments 201 in %dms',
  'reconcile loop finished, %d objects visited',
  'cache miss for key accounts:%d, falling back to postgres',
  'connection pool saturated, %d waiters queued',
  'context deadline exceeded talking to billing (%dms)',
  'flushed %d spans to the otel collector',
]

function podsFor(ref: ResourceRef): K8sObject[] {
  const object = fixtureObjects(ref.gvr.resource).find((item) => item.metadata.uid === ref.uid)
  if (object?.kind === 'Pod') return [object]

  return fixtureObjects('pods')
    .filter((pod) => pod.metadata.namespace === ref.namespace)
    .slice(0, 3)
}

export function fixtureTargets(ref: ResourceRef): LogTarget[] {
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

export function fixtureStream(
  token: string,
  target: LogTarget,
  opts: LogOptions,
  emit: (chunk: LogChunk) => void,
): () => void {
  let seq = 0

  const line = () => {
    seq += 1
    const level = LEVELS[seq % LEVELS.length]
    const message = MESSAGES[seq % MESSAGES.length]
      .replace('%s', (seq * 7919).toString(36))
      .replace('%d', String((seq * 37) % 900))
    const body = `${level.padEnd(5)} [${target.container}] ${message}`
    return opts.timestamps ? `${new Date().toISOString()} ${body}` : body
  }

  const backlog = opts.tailLines > 0 ? opts.tailLines : BURST
  const first = window.setTimeout(() => {
    emit({
      token,
      lines: Array.from({ length: backlog }, line),
      dropped: 0,
      done: !opts.follow,
    })
  }, 60)

  const ticker = opts.follow
    ? window.setInterval(() => {
        emit({ token, lines: Array.from({ length: PER_TICK }, line), dropped: 0, done: false })
      }, TICK)
    : 0

  return () => {
    window.clearTimeout(first)
    if (ticker) window.clearInterval(ticker)
  }
}
