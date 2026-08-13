import { Check, Install, OpenRelease } from '@bindings/go/app/UpdateAPI'
import { useClusters } from '@/features/clusters/cluster.store'
import type { UpdateStatus } from './update.types'

const offline = () => useClusters.getState().offline

// The browser preview has no bridge and no installed copy to replace, which is
// exactly what a development build looks like to the backend.
const DEVELOPMENT: UpdateStatus = {
  current: 'dev',
  latest: '',
  available: false,
  page: '',
  development: true,
}

export async function checkForUpdate(): Promise<UpdateStatus> {
  if (offline()) return DEVELOPMENT
  return (await Check()) as UpdateStatus
}

export async function installUpdate(): Promise<void> {
  if (offline()) return
  await Install()
}

export async function openReleasePage(): Promise<void> {
  if (offline()) return
  await OpenRelease()
}
