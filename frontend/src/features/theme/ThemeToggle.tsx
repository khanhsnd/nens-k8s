import { Moon, Sun } from 'lucide-react'
import { Tooltip } from '@/shared/ui/Tooltip'
import { useTheme } from './theme.store'

export function ThemeToggle() {
  const theme = useTheme((s) => s.theme)
  const toggle = useTheme((s) => s.toggle)
  const Icon = theme === 'dark' ? Sun : Moon

  return (
    <Tooltip label={theme === 'dark' ? 'Light theme' : 'Dark theme'} side="bottom">
      <button
        onClick={toggle}
        className="grid size-8 place-items-center rounded-md text-muted transition-colors hover:bg-raised hover:text-text"
      >
        <Icon className="size-4" />
      </button>
    </Tooltip>
  )
}
