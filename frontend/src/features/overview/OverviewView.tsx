import { useMemo, type ReactNode } from 'react'
import { useMetrics } from '@/features/metrics/metrics.store'
import { sliceKey, useResources } from '@/features/resources/resource.store'
import type { K8sObject } from '@/features/resources/resource.types'
import { age, bytes, cores } from '@/shared/lib/format'
import { Dot, FILLS, Pill } from '@/shared/ui/Badge'
import { Donut } from '@/shared/ui/Donut'
import { summarise, type Gauge, type Overview, type Phase, type Warning } from './overview.model'

const list = (objects?: Map<string, K8sObject>): K8sObject[] => [...(objects?.values() ?? [])]

const toneOf = (ratio: number | null): string => {
  if (ratio === null) return 'text-faint'
  if (ratio >= 0.9) return 'text-danger'
  if (ratio >= 0.75) return 'text-warn'
  return 'text-accent'
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-panel border border-line bg-surface p-3">
      {children}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-3 rounded-panel border border-line bg-surface p-3">
      <div className="mb-3 text-xs uppercase tracking-wide text-faint">{title}</div>
      {children}
    </section>
  )
}

function Meter({
  title,
  gauge,
  format,
  unknown,
}: {
  title: string
  gauge: Gauge
  format: (value: number) => string
  /** Metrics are missing, which is not the same as a usage of zero. */
  unknown?: boolean
}) {
  const ratio = unknown || gauge.total <= 0 ? null : gauge.used / gauge.total

  return (
    <Card>
      <Donut ratio={ratio} className={toneOf(ratio)} />
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide text-faint">{title}</div>
        <div className="truncate text-lg font-semibold">{unknown ? '—' : format(gauge.used)}</div>
        <div className="truncate text-xs text-faint">
          of {gauge.total > 0 ? format(gauge.total) : '—'}
        </div>
      </div>
    </Card>
  )
}

function Nodes({ nodes }: { nodes: Overview['nodes'] }) {
  const missing = nodes.total - nodes.ready

  return (
    <Card>
      <Donut
        ratio={nodes.total > 0 ? nodes.ready / nodes.total : null}
        className={missing > 0 ? 'text-warn' : 'text-ok'}
      />
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide text-faint">Nodes ready</div>
        <div className="truncate text-lg font-semibold">
          {nodes.ready}
          <span className="text-faint">/{nodes.total}</span>
        </div>
        <div className="truncate text-xs">
          {missing > 0 ? (
            <span className="text-warn">{missing} not ready</span>
          ) : (
            <span className="text-faint">all ready</span>
          )}
        </div>
      </div>
    </Card>
  )
}

function Phases({ phases }: { phases: Phase[] }) {
  const total = phases.reduce((sum, phase) => sum + phase.count, 0)
  if (total === 0) return <div className="text-sm text-faint">No pods</div>

  return (
    <>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        {phases.map((phase) => (
          <div
            key={phase.label}
            title={`${phase.label}: ${phase.count}`}
            style={{ width: `${(phase.count / total) * 100}%` }}
            className={FILLS[phase.tone]}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        {phases.map((phase) => (
          <span key={phase.label} className="flex items-center gap-1.5">
            <Dot tone={phase.tone} />
            <span className="text-muted">{phase.label}</span>
            <span className="font-semibold">{phase.count}</span>
          </span>
        ))}
      </div>
    </>
  )
}

function Warnings({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) {
    return <div className="text-sm text-faint">No warnings among the events the cluster kept</div>
  }

  return (
    <ul className="divide-y divide-line">
      {warnings.map((warning) => (
        <li key={warning.uid} className="flex items-center gap-3 py-1.5 text-sm">
          <Pill tone="warn">{warning.reason}</Pill>
          <span className="w-52 shrink-0 truncate font-mono text-xs text-faint" title={warning.object}>
            {warning.object || '—'}
          </span>
          <span className="min-w-0 flex-1 truncate text-muted" title={warning.message}>
            {warning.message}
          </span>
          {warning.count > 1 && <span className="shrink-0 text-xs text-faint">×{warning.count}</span>}
          <span className="w-10 shrink-0 text-right text-xs text-faint">
            {warning.last ? age(warning.last) : '—'}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function OverviewView({ clusterId }: { clusterId: string }) {
  const nodes = useResources((state) => state.slices[sliceKey(clusterId, 'nodes')]?.objects)
  const pods = useResources((state) => state.slices[sliceKey(clusterId, 'pods')]?.objects)
  const events = useResources((state) => state.slices[sliceKey(clusterId, 'events')]?.objects)

  const usage = useMetrics((state) => state.usage)
  const available = useMetrics((state) => state.available)
  const error = useMetrics((state) => state.error)

  const summary = useMemo(
    () => summarise(list(nodes), list(pods), list(events), usage),
    [nodes, pods, events, usage],
  )

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-base p-3">
      {error && (
        <div className="mb-3 rounded-panel border border-warn/40 bg-warn/10 px-3 py-1.5 text-xs text-warn">
          Metrics unavailable — {error}
        </div>
      )}

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
        <Meter title="CPU" gauge={summary.cpu} format={cores} unknown={!available} />
        <Meter title="Memory" gauge={summary.memory} format={bytes} unknown={!available} />
        <Meter title="Pods" gauge={summary.pods} format={String} />
        <Nodes nodes={summary.nodes} />
      </div>

      <Section title="Pods by phase">
        <Phases phases={summary.phases} />
      </Section>

      <Section title="Recent warnings">
        <Warnings warnings={summary.warnings} />
      </Section>
    </div>
  )
}
