import * as Menu from '@radix-ui/react-dropdown-menu'
import { Check } from 'lucide-react'

/** The tick box every multi-select menu in the app draws. */
export function MenuCheck() {
  return (
    <span className="grid size-3.5 shrink-0 place-items-center rounded-[3px] border border-line-strong">
      <Menu.ItemIndicator>
        <Check className="size-3" />
      </Menu.ItemIndicator>
    </span>
  )
}
