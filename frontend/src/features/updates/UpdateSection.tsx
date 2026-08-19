import { Download, ExternalLink, RefreshCw } from 'lucide-react'
import { useEffect } from 'react'
import { cn } from '@/shared/lib/cn'
import { ErrorText } from '@/shared/ui/ErrorText'
import { useUpdates } from './update.store'
import type { UpdateStatus } from './update.types'

const BUTTON =
  'flex shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-raised hover:text-text disabled:opacity-40'

const PRIMARY =
  'flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-sm font-medium text-base transition-opacity disabled:opacity-40'

function summary(status: UpdateStatus | null, checking: boolean) {
  if (checking && !status) return 'looking for a newer release…'
  if (!status) return ''
  if (status.development) return 'a development build updates itself from the repository, not from a release'
  if (!status.available) return `Nens ${status.current} is the latest release`
  if (status.canInstall) return `Nens ${status.latest} is available — this copy is ${status.current}`
  return `Nens ${status.latest} is available — replace this ${status.current} copy from the release page`
}

export function UpdateSection() {
  const { status, checking, installing, error, check, install, openRelease } = useUpdates()

  useEffect(() => {
    void check()
  }, [check])

  return (
    <div className="border-t border-line px-4 py-3">
      <div className="pb-1.5 text-2xs uppercase tracking-wide text-faint">Updates</div>

      <div className="flex items-center gap-2 text-xs">
        <span className="min-w-0 flex-1 truncate text-muted">{summary(status, checking)}</span>

        {status?.available && (
          <button onClick={() => void openRelease()} className={status.canInstall ? BUTTON : PRIMARY}>
            <ExternalLink className="size-3.5" />
            Release notes
          </button>
        )}

        {status?.canInstall && (
          <button disabled={installing} onClick={() => void install()} className={PRIMARY}>
            <Download className="size-3.5" />
            {installing ? 'Downloading…' : 'Install and restart'}
          </button>
        )}

        <button disabled={checking} onClick={() => void check()} className={BUTTON}>
          <RefreshCw className={cn('size-3.5', checking && 'animate-spin')} />
          Check
        </button>
      </div>

      {error && <ErrorText message={error} className="pt-1.5 text-2xs" />}
    </div>
  )
}
