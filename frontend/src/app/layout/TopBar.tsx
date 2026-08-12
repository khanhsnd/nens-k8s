import { RefreshCw, Search, SlidersHorizontal } from 'lucide-react'
import { activeTab, useTabs } from '@/features/tabs/tab.store'
import { ThemeToggle } from '@/features/theme/ThemeToggle'

export function TopBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const tab = useTabs(activeTab)

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-line bg-surface px-4">
      <h1 className="text-[15px] font-semibold tracking-tight">{tab?.title ?? 'Nens'}</h1>

      <button
        onClick={onOpenPalette}
        title="Jump to resource (Ctrl K)"
        className="ml-auto grid size-8 place-items-center rounded-md text-muted transition-colors hover:bg-raised hover:text-text"
      >
        <Search className="size-4" />
      </button>

      <ThemeToggle />

      <button className="grid size-8 place-items-center rounded-md text-muted transition-colors hover:bg-raised hover:text-text">
        <SlidersHorizontal className="size-4" />
      </button>
      <button className="grid size-8 place-items-center rounded-md text-muted transition-colors hover:bg-raised hover:text-text">
        <RefreshCw className="size-4" />
      </button>
    </header>
  )
}
