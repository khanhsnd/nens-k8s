import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { cn } from '@/shared/lib/cn'

export type PanelEdge = 'left' | 'right' | 'top'

const EDGES: Record<PanelEdge, string> = {
  left: 'inset-y-0 left-0 w-1 cursor-col-resize',
  right: 'inset-y-0 right-0 w-1 cursor-col-resize',
  top: 'inset-x-0 top-0 h-1 cursor-row-resize',
}

/**
 * Drags one edge of the panel it sits in and reports that panel's new size. The
 * opposite edge is what stays put, so it is measured once at pointerdown.
 */
export function Resizer({ edge, onResize }: { edge: PanelEdge; onResize: (size: number) => void }) {
  const handle = useRef<HTMLDivElement>(null)

  const start = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return

    const panel = handle.current?.parentElement?.getBoundingClientRect()
    if (!panel) return

    const sizeAt = (at: PointerEvent) => {
      if (edge === 'left') return panel.right - at.clientX
      if (edge === 'right') return at.clientX - panel.left
      return panel.bottom - at.clientY
    }

    const move = (at: PointerEvent) => onResize(sizeAt(at))
    const up = (at: PointerEvent) => {
      move(at)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div
      ref={handle}
      onPointerDown={start}
      className={cn('absolute z-10 transition-colors hover:bg-accent/40', EDGES[edge])}
    />
  )
}
