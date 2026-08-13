import { ChevronRight, Copy, Eye, EyeOff } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { ContainerRole } from '@/features/containers/container.types'
import { EMPTY_HISTORY, podKey, usePodMetrics, type Point } from '@/features/metrics/pod.usage.store'
import { UsageChart } from '@/features/metrics/UsageChart'
import { copyText } from '@/shared/lib/clipboard'
import { age, bytes, millicores } from '@/shared/lib/format'
import { millicoresOf, quantity } from '@/shared/lib/quantity'
import { Badge, Dot, Pill, type Tone } from '@/shared/ui/Badge'
import { Field, Heading } from '@/shared/ui/Field'
import { resolveEnv, type EnvEntry } from './env'
import { containerTone } from './pod.columns'
import type { K8sObject, ResourceRef } from './resource.types'

type Container = {
  name: string
  role: ContainerRole
  spec: any
  status?: any
}

function containersOf(pod: K8sObject): Container[] {
  const collect = (specKey: string, statusKey: string, role: ContainerRole): Container[] => {
    const statuses: any[] = pod.status?.[statusKey] ?? []
    return (pod.spec?.[specKey] ?? []).map((spec: any) => ({
      name: spec.name,
      role,
      spec,
      status: statuses.find((status) => status.name === spec.name),
    }))
  }

  return [
    ...collect('initContainers', 'initContainerStatuses', 'init'),
    ...collect('containers', 'containerStatuses', 'app'),
    ...collect('ephemeralContainers', 'ephemeralContainerStatuses', 'ephemeral'),
  ]
}

function stateText(status: any): string {
  if (!status) return 'not started'

  const state = status.state ?? {}
  if (state.running) return status.ready ? 'running, ready' : 'running, not ready'
  if (state.waiting) return ['waiting', state.waiting.reason].filter(Boolean).join(', ')
  if (state.terminated) {
    return ['terminated', state.terminated.reason, `exit ${state.terminated.exitCode}`]
      .filter(Boolean)
      .join(', ')
  }
  return 'unknown'
}

function lastStateText(status: any): string {
  const terminated = status?.lastState?.terminated
  if (!terminated) return ''

  return [
    'terminated',
    terminated.reason,
    `exit ${terminated.exitCode}`,
    terminated.finishedAt ? `${age(terminated.finishedAt)} ago` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

function portsText(spec: any): string {
  return (spec.ports ?? [])
    .map((port: any) =>
      [`${port.containerPort}/${port.protocol ?? 'TCP'}`, port.name].filter(Boolean).join(' '),
    )
    .join(', ')
}

function probeText(probe: any): string {
  if (!probe) return ''

  const target = probe.httpGet
    ? `${(probe.httpGet.scheme ?? 'HTTP').toLowerCase()} ${probe.httpGet.path ?? '/'}:${probe.httpGet.port}`
    : probe.tcpSocket
      ? `tcp :${probe.tcpSocket.port}`
      : probe.grpc
        ? `grpc :${probe.grpc.port}`
        : probe.exec
          ? `exec ${(probe.exec.command ?? []).join(' ')}`
          : ''

  return [target, `every ${probe.periodSeconds ?? 10}s`].filter(Boolean).join(' · ')
}

function quantities(values?: Record<string, string>): string {
  return Object.entries(values ?? {})
    .map(([resource, value]) => `${resource} ${value}`)
    .join(' · ')
}

function mountText(mount: any): string {
  const source = mount.subPath ? `${mount.name}/${mount.subPath}` : mount.name
  return `${mount.mountPath} from ${source}${mount.readOnly ? ' (ro)' : ''}`
}

function Block({
  label,
  action,
  children,
}: {
  label: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="mt-1.5 space-y-1 border-t border-line pt-1.5">
      <div className="flex items-center gap-2">
        <Heading>{label}</Heading>
        {action}
      </div>
      {children}
    </div>
  )
}

const HIDDEN = '••••••••••••'

function EnvLine({ entry }: { entry: EnvEntry }) {
  const [revealed, setRevealed] = useState(false)
  const hidden = Boolean(entry.secret) && !revealed

  return (
    <li
      title={entry.reason ?? entry.source}
      className="group/row flex items-start gap-1 rounded px-1 odd:bg-surface"
    >
      <span className="min-w-0 flex-1 break-all">
        <span className="font-medium text-text">{entry.name}</span>
        {!entry.missing && <span className="text-faint">=</span>}
        {entry.missing ? (
          <span className={entry.optional ? 'text-faint' : entry.reason ? 'text-warn' : 'text-danger'}>
            {' '}
            {entry.reason ? 'not readable' : 'not found'}
            {entry.optional ? ', optional' : ''}
          </span>
        ) : (
          <span className={hidden ? 'text-faint' : 'text-muted'}>
            {hidden ? HIDDEN : entry.value}
          </span>
        )}
      </span>

      {entry.secret && !entry.missing && (
        <button
          onClick={() => setRevealed(!revealed)}
          title={revealed ? 'Hide this value' : 'Reveal this value'}
          className="grid size-4 shrink-0 place-items-center rounded text-faint transition-colors hover:text-accent"
        >
          {revealed ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
        </button>
      )}

      {!entry.missing && (
        <button
          onClick={() => void copyText(entry.value)}
          title="Copy this value"
          className="grid size-4 shrink-0 place-items-center rounded text-faint opacity-0 transition-colors group-hover/row:opacity-100 hover:text-accent"
        >
          <Copy className="size-3" />
        </button>
      )}
    </li>
  )
}

function Environment({
  pod,
  spec,
  clusterId,
}: {
  pod: K8sObject
  spec: any
  clusterId: string
}) {
  const [entries, setEntries] = useState<EnvEntry[] | null>(null)
  const declared = (spec.env?.length ?? 0) + (spec.envFrom?.length ?? 0)

  // The informer hands out a new object on every update, so the effect keys on
  // what env is declared to be rather than on the spec's identity — otherwise a
  // busy pod would re-read its ConfigMaps and Secrets several times a second.
  const signature = JSON.stringify([spec.env ?? [], spec.envFrom ?? []])

  useEffect(() => {
    if (declared === 0) return

    let live = true
    setEntries(null)
    resolveEnv(pod, spec, clusterId)
      .then((resolved) => live && setEntries(resolved))
      .catch(() => live && setEntries([]))

    return () => {
      live = false
    }
  }, [pod.metadata.uid, clusterId, signature, declared])

  if (declared === 0) return null

  return (
    <Block
      label="Environment"
      action={<span className="text-2xs text-faint">{entries?.length ?? ''}</span>}
    >
      {entries === null ? (
        <p className="text-2xs text-faint">Reading ConfigMaps and Secrets…</p>
      ) : (
        <ul className="space-y-0.5 font-mono text-xs">
          {entries.map((entry) => (
            <EnvLine key={entry.name} entry={entry} />
          ))}
        </ul>
      )}
    </Block>
  )
}

function Mounts({ spec }: { spec: any }) {
  const mounts: any[] = spec.volumeMounts ?? []
  if (mounts.length === 0) return null

  return (
    <Block label="Mounts">
      <ul className="space-y-0.5 font-mono text-xs text-muted">
        {mounts.map((mount) => (
          <li key={mount.mountPath} className="break-all">
            {mountText(mount)}
          </li>
        ))}
      </ul>
    </Block>
  )
}

function Usage({ spec, points, error }: { spec: any; points: Point[]; error: string | null }) {
  if (points.length === 0) {
    return (
      <Block label="Usage">
        <p className="text-2xs text-faint">{error ?? 'Waiting for the first sample…'}</p>
      </Block>
    )
  }

  const requests = spec.resources?.requests ?? {}
  const limits = spec.resources?.limits ?? {}

  return (
    <Block label="Usage">
      <UsageChart
        label="CPU"
        tone="accent"
        points={points}
        value={(point) => point.cpuMilli}
        format={millicores}
        request={millicoresOf(requests.cpu)}
        limit={millicoresOf(limits.cpu)}
      />
      <UsageChart
        label="Memory"
        tone="info"
        points={points}
        value={(point) => point.memoryBytes}
        format={bytes}
        request={quantity(requests.memory)}
        limit={quantity(limits.memory)}
      />
    </Block>
  )
}

function ContainerCard({
  pod,
  container,
  clusterId,
  points,
  metricsError,
}: {
  pod: K8sObject
  container: Container
  clusterId: string
  points: Point[]
  metricsError: string | null
}) {
  const { spec, status } = container
  const tone: Tone = status ? containerTone(status) : 'neutral'
  const last = lastStateText(status)
  const image = status?.image ?? spec.image ?? '—'
  const command = (spec.command ?? []).join(' ')
  const args = (spec.args ?? []).join(' ')
  const requests = quantities(spec.resources?.requests)
  const limits = quantities(spec.resources?.limits)
  const restarts = status?.restartCount ?? 0
  const running = Boolean(status?.state?.running)

  return (
    <details open className="group rounded-md border border-line-strong bg-base px-2 py-1.5">
      <summary className="flex list-none items-center gap-1.5 text-sm">
        <ChevronRight className="size-3 shrink-0 text-faint transition-transform group-open:rotate-90" />
        <Dot tone={tone} />
        <span className="truncate font-medium">{container.name}</span>
        {container.role !== 'app' && <Pill>{container.role}</Pill>}
        {restarts > 0 && (
          <span className="ml-auto shrink-0 text-xs text-warn">{restarts} restarts</span>
        )}
      </summary>

      {(running || points.length > 0) && (
        <Usage spec={spec} points={points} error={metricsError} />
      )}

      <dl className="mt-1.5 border-t border-line pt-1.5 text-sm">
        <Field label="Status" value={<Badge tone={tone}>{stateText(status)}</Badge>} />
        {last && <Field label="Last status" value={last} />}
        <Field label="Image" value={<span title={image}>{image}</span>} />
        {spec.imagePullPolicy && <Field label="Pull policy" value={spec.imagePullPolicy} />}
        {portsText(spec) && <Field label="Ports" value={portsText(spec)} />}
        {command && <Field label="Command" value={<span title={command}>{command}</span>} />}
        {args && <Field label="Args" value={<span title={args}>{args}</span>} />}
        {requests && <Field label="Requests" value={requests} />}
        {limits && <Field label="Limits" value={limits} />}
        {probeText(spec.livenessProbe) && (
          <Field label="Liveness" value={probeText(spec.livenessProbe)} />
        )}
        {probeText(spec.readinessProbe) && (
          <Field label="Readiness" value={probeText(spec.readinessProbe)} />
        )}
        {probeText(spec.startupProbe) && (
          <Field label="Startup" value={probeText(spec.startupProbe)} />
        )}
      </dl>

      <Environment pod={pod} spec={spec} clusterId={clusterId} />
      <Mounts spec={spec} />
    </details>
  )
}

export function ContainerPanel({ pod, target }: { pod: K8sObject; target: ResourceRef }) {
  const follow = usePodMetrics((state) => state.follow)
  const key = podKey(target)
  // The series belongs to the pod it was sampled from: the store resets on the
  // next poll, and one frame of the previous pod's chart would be a lie.
  const history = usePodMetrics((state) => (state.key === key ? state.history : EMPTY_HISTORY))
  const error = usePodMetrics((state) => (state.key === key ? state.error : null))

  useEffect(() => {
    follow(target)
    return () => follow(null)
  }, [follow, target])

  const containers = containersOf(pod)
  if (containers.length === 0) return null

  return (
    <div className="mt-4 space-y-1.5">
      <Heading>Containers</Heading>
      {containers.map((container) => (
        <ContainerCard
          key={`${container.role}/${container.name}`}
          pod={pod}
          container={container}
          clusterId={target.clusterId}
          points={history.get(container.name) ?? []}
          metricsError={error}
        />
      ))}
    </div>
  )
}
