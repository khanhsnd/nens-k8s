/** Where this copy of Nens stands against the newest published release. */
export type UpdateStatus = {
  current: string
  latest: string
  available: boolean
  /** Only the Windows build replaces itself; elsewhere the release page is the answer. */
  canInstall: boolean
  page: string
  development: boolean
}
