import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info'

const TONES: Record<Tone, string> = {
  neutral: 'text-muted',
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
  info: 'text-info',
}

const PILLS: Record<Tone, string> = {
  neutral: 'border-line-strong text-faint',
  ok: 'border-ok/40 bg-ok/10 text-ok',
  warn: 'border-warn/40 bg-warn/10 text-warn',
  danger: 'border-danger/40 bg-danger/10 text-danger',
  info: 'border-info/40 bg-info/10 text-info',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cn('font-semibold', TONES[tone])}>{children}</span>
}

/**
 * A bordered chip. Its height is fixed and its leading reset because a grid cell
 * sets `line-height` to the row height — inheriting that makes the border taller
 * than the row it sits in.
 */
export function Pill({
  tone = 'neutral',
  mono,
  title,
  children,
}: {
  tone?: Tone
  mono?: boolean
  title?: string
  children: ReactNode
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex h-[17px] max-w-full items-center gap-1 truncate rounded-full border px-1.5 align-middle text-[10.5px] leading-none',
        mono ? 'font-mono' : 'uppercase tracking-wide',
        PILLS[tone],
      )}
    >
      {children}
    </span>
  )
}

export function Dot({ tone = 'neutral' }: { tone?: Tone }) {
  const colors: Record<Tone, string> = {
    neutral: 'bg-faint',
    ok: 'bg-ok',
    warn: 'bg-warn',
    danger: 'bg-danger',
    info: 'bg-info',
  }
  return <span className={cn('size-1.5 shrink-0 rounded-full', colors[tone])} />
}
