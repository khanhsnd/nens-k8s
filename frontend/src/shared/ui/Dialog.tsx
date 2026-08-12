import { useEffect, type ReactNode } from 'react'

export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onMouseDown={onClose}
      className="fixed inset-0 z-50 grid place-items-start justify-center bg-black/50 pt-[12vh]"
    >
      <div
        onMouseDown={(event) => event.stopPropagation()}
        className="w-[580px] overflow-hidden rounded-xl border border-line-strong bg-overlay shadow-2xl"
      >
        <div className="border-b border-line px-4 py-3 text-md font-semibold">{title}</div>
        {children}
      </div>
    </div>
  )
}
