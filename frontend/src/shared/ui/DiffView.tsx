import { useVirtualizer } from '@tanstack/react-virtual'
import { useMemo, useRef } from 'react'
import { cn } from '@/shared/lib/cn'
import { diffLines, type DiffKind } from '@/shared/lib/diff'

const LINE_HEIGHT = 19
const GUTTER = 5 // line-number column, in characters

const MARKS: Record<DiffKind, string> = { same: ' ', add: '+', remove: '-' }

const TONES: Record<DiffKind, string> = {
  same: 'text-muted',
  add: 'bg-ok/10 text-ok',
  remove: 'bg-danger/10 text-danger',
}

/** A unified diff of two texts: the drawer is narrow, so columns would not fit. */
export function DiffView({ before, after }: { before: string; after: string }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const diff = useMemo(() => diffLines(before, after), [before, after])

  const virtualizer = useVirtualizer({
    count: diff.lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => LINE_HEIGHT,
    overscan: 24,
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-3 py-1.5 text-xs">
        {diff.added === 0 && diff.removed === 0 ? (
          <span className="text-faint">identical</span>
        ) : (
          <>
            <span className="text-ok">+{diff.added}</span>
            <span className="text-danger">−{diff.removed}</span>
          </>
        )}
        {!diff.exact && (
          <span className="ml-auto text-warn">
            too large to align — shown as one replaced block
          </span>
        )}
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 select-text overflow-auto font-mono text-xs leading-[1.65] [scrollbar-gutter:stable]"
      >
        <div style={{ height: virtualizer.getTotalSize() }} className="relative">
          {virtualizer.getVirtualItems().map((item) => {
            const line = diff.lines[item.index]

            return (
              <div
                key={item.key}
                style={{ transform: `translateY(${item.start}px)`, height: LINE_HEIGHT }}
                className={cn(
                  'absolute left-0 top-0 flex w-max min-w-full gap-2 px-3',
                  TONES[line.kind],
                )}
              >
                <span
                  style={{ width: `${GUTTER}ch` }}
                  className="shrink-0 select-none text-right tabular-nums text-faint"
                >
                  {line.before || ''}
                </span>
                <span
                  style={{ width: `${GUTTER}ch` }}
                  className="shrink-0 select-none text-right tabular-nums text-faint"
                >
                  {line.after || ''}
                </span>
                <span className="whitespace-pre">
                  {MARKS[line.kind]} {line.text}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
