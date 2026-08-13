import { Sample } from '@bindings/go/app/MetricsAPI'
import { useClusters } from '@/features/clusters/cluster.store'
import { fixtureSample } from './metrics.fixtures'
import type { MetricsSample } from './metrics.types'

export async function sampleMetrics(clusterId: string): Promise<MetricsSample> {
  if (useClusters.getState().offline) return fixtureSample(clusterId)
  return (await Sample(clusterId)) as MetricsSample
}
