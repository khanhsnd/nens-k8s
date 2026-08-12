import { Command } from 'cmdk'
import { useEffect } from 'react'
import { NAV_SECTIONS } from '@/features/navigation/nav.model'
import { useTabs } from '@/features/tabs/tab.store'

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const openTab = useTabs((s) => s.open)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command palette"
      className="fixed inset-0 z-50 grid place-items-start justify-center bg-black/50 pt-[15vh]"
    >
      <div className="w-[560px] overflow-hidden rounded-xl border border-line-strong bg-overlay shadow-2xl">
        <Command.Input
          autoFocus
          placeholder="Jump to resource"
          className="w-full border-b border-line bg-transparent px-4 py-3 text-[13px] outline-none placeholder:text-faint"
        />
        <Command.List className="max-h-80 overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-[12px] text-faint">
            No matches
          </Command.Empty>
          {NAV_SECTIONS.map((section) => (
            <Command.Group
              key={section.id}
              heading={section.label}
              className="px-1 pb-1 text-[10px] uppercase tracking-wide text-faint"
            >
              {section.children.map((leaf) => (
                <Command.Item
                  key={leaf.id}
                  value={`${section.label} ${leaf.label}`}
                  onSelect={() => {
                    openTab(section.id, leaf.id)
                    onOpenChange(false)
                  }}
                  className="cursor-pointer rounded-md px-2.5 py-1.5 text-[12.5px] normal-case tracking-normal text-muted data-[selected=true]:bg-accent-dim data-[selected=true]:text-accent"
                >
                  {leaf.label}
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
      </div>
    </Command.Dialog>
  )
}
