import { useVirtualizer } from '@tanstack/react-virtual'
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { cn } from '@/shared/lib/cn'
import type { LogBuffer } from './log.buffer'
import type { Span } from './log.search'
import type { LogLine } from './log.types'

const LINE_HEIGHT = 19
const AT_BOTTOM = 40

const GUTTER = 7 // line-number column, in characters
const PADDING_X = 24 // px-3 on both sides
const GAP = 8 // gap-2 between the gutter and the message

const DANGER = /\b(error|fatal|panic|exception|crash)\b/i
const WARNING = /\b(warn|warning|deprecated|retry|retrying)\b/i

function tone(text: string): string | undefined {
  if (DANGER.test(text)) return 'text-danger'
  if (WARNING.test(text)) return 'text-warn'
  return undefined
}

/** Characters the message column fits, so a wrapped row's height is arithmetic. */
function useColumns(view: RefObject<HTMLDivElement | null>) {
  const [columns, setColumns] = useState(120)

  useEffect(() => {
    const scroller = view.current
    if (!scroller) return

    // Fixed position keeps the probe out of the scroller's overflow while it
    // still inherits the font the log is rendered in.
    const probe = document.createElement('span')
    probe.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;white-space:pre'
    probe.textContent = '0'.repeat(100)
    scroller.appendChild(probe)

    const update = () => {
      const character = probe.getBoundingClientRect().width / 100
      if (character <= 0) return

      const usable = scroller.clientWidth - PADDING_X - GAP - GUTTER * character
      setColumns(Math.max(20, Math.floor(usable / character)))
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(scroller)

    return () => {
      observer.disconnect()
      probe.remove()
    }
  }, [view])

  return columns
}

const printed = (line: LogLine) =>
  (line.label ? line.label.length + 1 : 0) + (line.time ? line.time.length + 1 : 0) + line.text.length

function Highlighted({ text, spans }: { text: string; spans: Span[] }) {
  if (spans.length === 0) return text

  const parts: ReactNode[] = []
  let at = 0

  for (const [start, end] of spans) {
    if (start > at) parts.push(text.slice(at, start))
    parts.push(
      <mark key={start} className="rounded-[2px] bg-warn/35 text-text">
        {text.slice(start, end)}
      </mark>,
    )
    at = end
  }
  if (at < text.length) parts.push(text.slice(at))
  return parts
}

export function LogView({
  buffer,
  version,
  wrap,
  follow,
  cursor,
  onLeaveFollow,
}: {
  buffer: LogBuffer
  version: number
  wrap: boolean
  follow: boolean
  cursor: number
  onLeaveFollow: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const previousTop = useRef(0)
  const columns = useColumns(scrollRef)
  const count = buffer.size()

  // Keyed by the line, not by the row: trimming and filtering both renumber the
  // rows, and an index key would then hand a row the height of a different line.
  const itemKey = useCallback((index: number) => buffer.at(index)?.n ?? index, [buffer])

  const estimateSize = useCallback(
    (index: number) => {
      const line = buffer.at(index)
      if (!line || !wrap) return LINE_HEIGHT
      return Math.max(1, Math.ceil(printed(line) / columns)) * LINE_HEIGHT
    },
    [buffer, wrap, columns],
  )

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    getItemKey: itemKey,
    estimateSize,
    // Lets the virtualizer notice the rows were renumbered and rebuild offsets.
    anchorTo: 'end',
    overscan: 24,
  })

  // A different width invalidates every measured height; nothing else does.
  useEffect(() => {
    virtualizer.measure()
  }, [wrap, columns, virtualizer])

  // A full buffer stops growing, so following keys on the version, not the count.
  useEffect(() => {
    if (follow && count > 0) virtualizer.scrollToIndex(count - 1, { align: 'end' })
  }, [follow, count, version, virtualizer])

  useEffect(() => {
    if (cursor >= 0) virtualizer.scrollToIndex(buffer.rowOfMatch(cursor), { align: 'center' })
  }, [cursor, buffer, virtualizer])

  const active = cursor >= 0 ? buffer.rowOfMatch(cursor) : -1

  if (count === 0) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center text-[12px] text-faint">
        No log lines yet
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      onScroll={(event) => {
        const view = event.currentTarget
        // Only a user scrolls upwards; following and re-measuring only ever scroll down.
        const upwards = view.scrollTop < previousTop.current - 4
        previousTop.current = view.scrollTop

        const away = view.scrollHeight - view.scrollTop - view.clientHeight
        if (follow && upwards && away > AT_BOTTOM) onLeaveFollow()
      }}
      className={cn(
        'min-h-0 flex-1 select-text overflow-y-scroll font-mono text-[11.5px] leading-[19px] [scrollbar-gutter:stable]',
        wrap ? 'overflow-x-hidden' : 'overflow-x-auto',
      )}
    >
      <div style={{ height: virtualizer.getTotalSize() }} className="relative">
        {virtualizer.getVirtualItems().map((item) => {
          const line = buffer.at(item.index)
          if (!line) return null

          return (
            <div
              key={item.key}
              data-index={item.index}
              ref={wrap ? virtualizer.measureElement : undefined}
              style={{ transform: `translateY(${item.start}px)` }}
              className={cn(
                'absolute left-0 top-0 flex gap-2 px-3',
                wrap ? 'w-full' : 'w-max min-w-full',
                item.index === active && 'bg-accent-dim',
              )}
            >
              <span
                style={{ width: `${GUTTER}ch` }}
                className="shrink-0 select-none text-right tabular-nums text-faint"
              >
                {line.n}
              </span>

              <span
                className={cn(
                  'min-w-0 flex-1',
                  wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre',
                )}
              >
                {line.label && <span className="text-info">{line.label} </span>}
                {line.time && <span className="text-faint">{line.time} </span>}
                <span className={tone(line.text)}>
                  <Highlighted text={line.text} spans={buffer.spansOf(line.text)} />
                </span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
