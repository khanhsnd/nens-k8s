import { Copy, X } from 'lucide-react'
import { copyText } from '@/shared/lib/clipboard'
import { cn } from '@/shared/lib/cn'
import { TONES, type Tone } from './Badge'
import { useToasts, type Toast } from './toast.store'

const EDGES: Record<Tone, string> = {
  neutral: 'border-line-strong',
  ok: 'border-ok/50',
  warn: 'border-warn/50',
  danger: 'border-danger/50',
  info: 'border-info/50',
}

const text = (toast: Toast) => [toast.title, toast.detail].filter(Boolean).join('\n')

export function Toasts() {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-9 right-4 z-50 flex w-[26rem] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'rounded-lg border bg-overlay p-2.5 text-xs shadow-2xl',
            EDGES[toast.tone],
          )}
        >
          <div className="flex items-start gap-2">
            <span className={cn('min-w-0 flex-1 font-semibold', TONES[toast.tone])}>
              {toast.title}
            </span>
            <button
              title="Copy this message"
              onClick={() => void copyText(text(toast))}
              className="grid size-5 shrink-0 place-items-center rounded text-faint transition-colors hover:bg-raised hover:text-accent"
            >
              <Copy className="size-3.5" />
            </button>
            <button
              title="Dismiss"
              onClick={() => dismiss(toast.id)}
              className="grid size-5 shrink-0 place-items-center rounded text-faint transition-colors hover:bg-raised hover:text-text"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {toast.detail && (
            <p className="mt-1.5 max-h-32 select-text overflow-auto whitespace-pre-wrap break-words font-mono text-2xs text-muted">
              {toast.detail}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
