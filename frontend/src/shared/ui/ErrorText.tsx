import { Copy } from 'lucide-react'
import { copyText } from '@/shared/lib/clipboard'
import { cn } from '@/shared/lib/cn'

/**
 * A failure the user is shown, in the one form they can act on: the app sets
 * `user-select: none`, so a message that is only painted is a message nobody can
 * paste into a bug report. Every inline error reads back out of here.
 */
export function ErrorText({ message, className }: { message: string; className?: string }) {
  return (
    <div className={cn('flex items-start gap-1.5 text-xs text-danger', className)}>
      <p className="min-w-0 flex-1 select-text whitespace-pre-wrap break-words">{message}</p>
      <button
        title="Copy this message"
        onClick={() => void copyText(message)}
        className="grid size-5 shrink-0 place-items-center rounded text-faint transition-colors hover:bg-raised hover:text-accent"
      >
        <Copy className="size-3.5" />
      </button>
    </div>
  )
}
