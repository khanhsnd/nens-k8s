import * as Menu from '@radix-ui/react-dropdown-menu'
import { ChevronDown } from 'lucide-react'
import { useMemo, useRef, useState, type RefObject } from 'react'
import { cn } from '@/shared/lib/cn'
import { MenuCheck } from '@/shared/ui/MenuCheck'

// Everything else is typing: the menu's own typeahead would eat it.
const FOR_THE_MENU = new Set(['Escape', 'Tab', 'ArrowDown', 'ArrowUp'])

function summary(chosen: string[]): string {
  if (chosen.length === 0) return 'All namespaces'
  if (chosen.length === 1) return chosen[0]
  return `${chosen.length} namespaces`
}

function Search({
  inputRef,
  query,
  onQuery,
  onEnter,
}: {
  inputRef: RefObject<HTMLInputElement | null>
  query: string
  onQuery: (query: string) => void
  onEnter: () => void
}) {
  return (
    <input
      ref={inputRef}
      value={query}
      spellCheck={false}
      placeholder="Filter namespaces"
      onChange={(event) => onQuery(event.target.value)}
      onKeyDown={(event) => {
        if (FOR_THE_MENU.has(event.key)) return
        event.stopPropagation()
        if (event.key === 'Enter') onEnter()
      }}
      className="mb-1 w-full rounded border border-line bg-base px-2 py-1.5 text-sm text-text outline-none placeholder:text-faint focus:border-accent/60"
    />
  )
}

/**
 * Multi-select over the namespaces in view, with its own search box: a cluster can
 * have hundreds, and the interesting question is usually two or three of them at
 * once. An empty selection means every namespace.
 */
export function NamespaceFilter({
  namespaces,
  value,
  onChange,
}: {
  namespaces: string[]
  value: string[]
  onChange: (namespaces: string[]) => void
}) {
  const [query, setQuery] = useState('')
  const search = useRef<HTMLInputElement>(null)

  // A namespace that is still selected but has no rows left has to stay in the
  // list, or there would be no way to untick it.
  const options = useMemo(() => [...new Set([...namespaces, ...value])].sort(), [namespaces, value])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle ? options.filter((item) => item.toLowerCase().includes(needle)) : options
  }, [options, query])

  // Ticking sends focus back to the box, so "narrow, tick, narrow again" never
  // needs the mouse to return to it.
  const toggle = (namespace: string) => {
    onChange(
      value.includes(namespace)
        ? value.filter((item) => item !== namespace)
        : [...value, namespace],
    )
    search.current?.focus()
  }

  return (
    <Menu.Root onOpenChange={(open) => open && setQuery('')}>
      <Menu.Trigger
        title="Filter by namespace"
        className="flex w-48 shrink-0 items-center gap-1.5 rounded-md border border-line bg-base py-1.5 pl-2.5 pr-2 text-sm outline-none transition-colors hover:border-line-strong focus:border-accent/60 data-[state=open]:border-accent/60"
      >
        <span className={cn('min-w-0 flex-1 truncate text-left', value.length === 0 && 'text-faint')}>
          {summary(value)}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-faint" />
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Content
          align="start"
          sideOffset={6}
          // The menu focuses its own content — on open, and again when an item is
          // ticked — and exposes no hook to redirect that, so the search box takes
          // focus whenever the content itself receives it.
          onFocus={(event) => {
            if (event.target === event.currentTarget) search.current?.focus()
          }}
          className="z-50 w-64 rounded-md border border-line-strong bg-overlay p-1 text-sm shadow-xl"
        >
          <Search
            inputRef={search}
            query={query}
            onQuery={setQuery}
            onEnter={() => visible[0] && toggle(visible[0])}
          />

          <div className="max-h-64 overflow-y-auto">
            {visible.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-faint">No namespace matches</div>
            )}

            {visible.map((namespace) => (
              <Menu.CheckboxItem
                key={namespace}
                checked={value.includes(namespace)}
                onSelect={(event) => {
                  event.preventDefault()
                  toggle(namespace)
                }}
                className="flex cursor-default items-center gap-2 rounded px-2 py-1.5 text-muted outline-none data-[highlighted]:bg-raised data-[highlighted]:text-text"
              >
                <MenuCheck />
                <span className="truncate">{namespace}</span>
              </Menu.CheckboxItem>
            ))}
          </div>

          {value.length > 0 && (
            <>
              <Menu.Separator className="my-1 h-px bg-line" />
              <Menu.Item
                onSelect={(event) => {
                  event.preventDefault()
                  onChange([])
                }}
                className="flex cursor-default items-center rounded px-2 py-1.5 pl-[26px] text-muted outline-none data-[highlighted]:bg-raised data-[highlighted]:text-text"
              >
                All namespaces
              </Menu.Item>
            </>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
