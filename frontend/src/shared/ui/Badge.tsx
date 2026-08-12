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

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cn('font-semibold', TONES[tone])}>{children}</span>
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
