import { Detail, History, Releases, Rollback, Uninstall } from '@bindings/go/app/HelmAPI'
import type { domain } from '@bindings/go/models'
import { useClusters } from '@/features/clusters/cluster.store'
import { fixtureDetail, fixtureHistory, fixtureReleases } from './helm.fixtures'
import { releaseKey, type HelmDetail, type HelmRef, type HelmRelease } from './helm.types'

const offline = () => useClusters.getState().offline

// Offline there is no cluster behind the bindings, so these two are the cluster:
// an uninstalled release leaves the table and a rollback adds a revision.
const uninstalled = new Set<string>()
const rolledBack = new Map<string, number>()

/** What helm does to the ledger: the old revision is re-applied as a new one. */
function rolledForward(latest: HelmRelease, source: number): HelmRelease {
  return {
    ...latest,
    revision: latest.revision + 1,
    status: 'deployed',
    description: `Rollback to ${source}`,
    updated: new Date().toISOString(),
  }
}

export async function listReleases(clusterId: string): Promise<HelmRelease[]> {
  if (offline()) {
    return fixtureReleases(clusterId)
      .filter((release) => !uninstalled.has(releaseKey(release)))
      .map((release) => {
        const source = rolledBack.get(releaseKey(release))
        return source === undefined ? release : rolledForward(release, source)
      })
  }
  return (await Releases(clusterId)) as HelmRelease[]
}

export async function historyOf(ref: HelmRef): Promise<HelmRelease[]> {
  if (offline()) {
    const history = fixtureHistory(ref)
    const source = rolledBack.get(releaseKey(ref))
    if (source === undefined || history.length === 0) return history

    return [rolledForward(history[0], source), ...history]
  }
  return (await History(ref as domain.HelmRef)) as HelmRelease[]
}

/** Revision 0 is whatever the release is on now. */
export async function detailOf(ref: HelmRef, revision: number): Promise<HelmDetail> {
  if (offline()) return fixtureDetail(ref, revision)
  return (await Detail(ref as domain.HelmRef, revision)) as HelmDetail
}

export async function rollbackRelease(ref: HelmRef, revision: number): Promise<void> {
  if (offline()) {
    rolledBack.set(releaseKey(ref), revision)
    return
  }
  await Rollback(ref as domain.HelmRef, revision)
}

export async function uninstallRelease(ref: HelmRef): Promise<void> {
  if (offline()) {
    uninstalled.add(releaseKey(ref))
    return
  }
  await Uninstall(ref as domain.HelmRef)
}
