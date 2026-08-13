import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export type MenuAction = {
  label: string
  disabled?: boolean
  /** Draws a separator above this action. */
  separated?: boolean
  onSelect: () => void
}

const MARGIN = 4

/**
 * A right-click menu at a point. Hand-rolled rather than Radix: the dropdown
 * primitive anchors to a trigger element, and what anchors this one is the
 * pointer — a virtual anchor is more wiring than the whole component.
 */
export function ContextMenu({
  at,
  actions,
  onClose,
}: {
  at: { x: number; y: number }
  actions: MenuAction[]
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState(at)

  // Placed first, then pulled back inside the window once it has a size.
  useLayoutEffect(() => {
    const menu = ref.current
    if (!menu) return

    const { width, height } = menu.getBoundingClientRect()
    setBox({
      x: Math.max(MARGIN, Math.min(at.x, window.innerWidth - width - MARGIN)),
      y: Math.max(MARGIN, Math.min(at.y, window.innerHeight - height - MARGIN)),
    })
  }, [at])

  useEffect(() => {
    // Contains-check rather than a blanket close: closing on the pointerdown that
    // precedes a click would unmount the item before its click ever lands.
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()

    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)

    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="menu"
      style={{ left: box.x, top: box.y }}
      className="fixed z-50 min-w-44 rounded-md border border-line-strong bg-overlay p-1 text-sm shadow-xl"
    >
      {actions.map((action) => (
        <div key={action.label}>
          {action.separated && <div className="my-1 h-px bg-line" />}
          <button
            role="menuitem"
            disabled={action.disabled}
            onClick={() => {
              action.onSelect()
              onClose()
            }}
            className="w-full rounded px-2 py-1.5 text-left text-muted transition-colors hover:bg-raised hover:text-text disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted"
          >
            {action.label}
          </button>
        </div>
      ))}
    </div>
  )
}
