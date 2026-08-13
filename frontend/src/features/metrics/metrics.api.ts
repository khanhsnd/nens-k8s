import { PodSample, Sample } from '@bindings/go/app/MetricsAPI'
import { useClusters } from '@/features/clusters/cluster.store'
import { fixturePodUsage, fixtureSample } from './metrics.fixtures'
import type { MetricsSample, PodUsage } from './metrics.types'

export async function sampleMetrics(clusterId: string): Promise<MetricsSample> {
  if (useClusters.getState().offline) return fixtureSample(clusterId)
  return (await Sample(clusterId)) as MetricsSample
}

export async function samplePodUsage(
  clusterId: string,
  namespace: string,
  name: string,
): Promise<PodUsage> {
  if (useClusters.getState().offline) return fixturePodUsage(namespace, name)
  return (await PodSample(clusterId, namespace, name)) as PodUsage
}
