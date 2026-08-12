import * as Menu from '@radix-ui/react-dropdown-menu'
import { Check, MoreHorizontal } from 'lucide-react'
import type { Column } from './DataGrid'

export function ColumnMenu<T>({
  columns,
  hidden,
  onToggle,
  onReset,
}: {
  columns: Column<T>[]
  hidden: Set<string>
  onToggle: (key: string) => void
  onReset: () => void
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        title="Columns"
        className="grid size-6 place-items-center rounded text-faint transition-colors hover:bg-overlay hover:text-text data-[state=open]:bg-overlay data-[state=open]:text-text"
      >
        <MoreHorizontal className="size-4" />
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-52 rounded-md border border-line-strong bg-overlay p-1 text-[12px] shadow-xl"
        >
          {columns.map((column) => (
            <Menu.CheckboxItem
              key={column.key}
              checked={!hidden.has(column.key)}
              disabled={column.fixed}
              onSelect={(event) => {
                event.preventDefault()
                onToggle(column.key)
              }}
              className="flex cursor-default items-center gap-2 rounded px-2 py-1.5 text-muted outline-none data-[disabled]:text-faint data-[highlighted]:bg-raised data-[highlighted]:text-text"
            >
              <span className="grid size-3.5 shrink-0 place-items-center rounded-[3px] border border-line-strong">
                <Menu.ItemIndicator>
                  <Check className="size-3" />
                </Menu.ItemIndicator>
              </span>
              {column.label}
            </Menu.CheckboxItem>
          ))}

          <Menu.Separator className="my-1 h-px bg-line" />

          <Menu.Item
            onSelect={onReset}
            className="flex cursor-default items-center rounded px-2 py-1.5 pl-[26px] text-muted outline-none data-[highlighted]:bg-raised data-[highlighted]:text-text"
          >
            Reset columns
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
