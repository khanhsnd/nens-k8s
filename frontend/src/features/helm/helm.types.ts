export type HelmStatus =
  | 'unknown'
  | 'deployed'
  | 'uninstalled'
  | 'superseded'
  | 'failed'
  | 'uninstalling'
  | 'pending-install'
  | 'pending-upgrade'
  | 'pending-rollback'

/** One revision of a release: the newest in the table, an older one in a history. */
export type HelmRelease = {
  clusterId: string
  namespace: string
  name: string
  revision: number
  status: HelmStatus
  chart: string
  chartVersion: string
  appVersion: string
  updated: string
  description?: string
}

export type HelmRef = {
  clusterId: string
  namespace: string
  name: string
}

export type HelmDetail = {
  release: HelmRelease
  values: string
  manifest: string
  notes?: string
}

/** A release has no UID: helm identifies it by namespace and name. */
export const releaseKey = (release: HelmRef) => `${release.namespace}/${release.name}`

export const refOf = ({ clusterId, namespace, name }: HelmRelease): HelmRef => ({
  clusterId,
  namespace,
  name,
})

export const chartOf = (release: HelmRelease) =>
  release.chartVersion ? `${release.chart}-${release.chartVersion}` : release.chart
