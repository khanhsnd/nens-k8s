import * as Menu from '@radix-ui/react-dropdown-menu'
import { Copy, Plug, Settings2, Unplug, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { copyText } from '@/shared/lib/clipboard'
import { useClusters } from './cluster.store'
import { ClusterSettingsDialog } from './ClusterSettingsDialog'
import type { Cluster } from './cluster.types'

function Item({
  icon: Icon,
  label,
  onSelect,
}: {
  icon: LucideIcon
  label: string
  onSelect: () => void
}) {
  return (
    <Menu.Item
      onSelect={onSelect}
      className="flex cursor-default items-center gap-2 rounded px-2 py-1.5 text-muted outline-none data-[highlighted]:bg-raised data-[highlighted]:text-text"
    >
      <Icon className="size-3.5" />
      {label}
    </Menu.Item>
  )
}

export function ClusterMenu({ cluster, children }: { cluster: Cluster; children: ReactNode }) {
  const activate = useClusters((s) => s.activate)
  const disconnect = useClusters((s) => s.disconnect)
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState(false)

  return (
    <>
      <Menu.Root open={open} onOpenChange={setOpen}>
        <div
          onContextMenu={(event) => {
            event.preventDefault()
            setOpen(true)
          }}
          className="relative"
        >
          {children}
          <Menu.Trigger tabIndex={-1} aria-hidden className="pointer-events-none absolute inset-0" />
        </div>

        <Menu.Portal>
          <Menu.Content
            side="right"
            align="start"
            sideOffset={8}
            className="z-50 min-w-48 rounded-md border border-line-strong bg-overlay p-1 text-[12px] shadow-xl"
          >
            <Item icon={Settings2} label="Cluster settings…" onSelect={() => setSettings(true)} />
            {cluster.phase === 'connected' ? (
              <Item
                icon={Unplug}
                label="Disconnect"
                onSelect={() => void disconnect(cluster.id)}
              />
            ) : (
              <Item icon={Plug} label="Connect" onSelect={() => void activate(cluster.id)} />
            )}
            <Item
              icon={Copy}
              label="Copy context name"
              onSelect={() => void copyText(cluster.context)}
            />
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>

      {settings && (
        <ClusterSettingsDialog cluster={cluster} onClose={() => setSettings(false)} />
      )}
    </>
  )
}
