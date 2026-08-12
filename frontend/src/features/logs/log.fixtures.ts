import type { ContainerTarget } from '@/features/containers/container.types'
import type { LogChunk, LogOptions } from './log.types'

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

export function fixtureStream(
  token: string,
  target: ContainerTarget,
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
