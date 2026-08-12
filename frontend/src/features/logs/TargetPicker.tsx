import * as Menu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronDown } from 'lucide-react'
import { targetKey, type ContainerTarget } from '@/features/containers/container.types'
import { cn } from '@/shared/lib/cn'

const ROLES: Record<string, string> = { init: 'init', ephemeral: 'debug' }

function summary(targets: ContainerTarget[], selection: string[]): string {
  if (selection.length === 0) return 'no container'
  if (selection.length === 1) return selection[0].split('/')[1]

  const pods = new Set(targets.filter((t) => selection.includes(targetKey(t))).map((t) => t.pod))
  if (pods.size > 1) return `${selection.length} containers · ${pods.size} pods`
  return `${selection.length} containers`
}

function byPod(targets: ContainerTarget[]): Array<[string, ContainerTarget[]]> {
  const pods = new Map<string, ContainerTarget[]>()
  for (const target of targets) {
    pods.set(target.pod, [...(pods.get(target.pod) ?? []), target])
  }
  return [...pods]
}

export function TargetPicker({
  targets,
  selection,
  onChange,
}: {
  targets: ContainerTarget[]
  selection: string[]
  onChange: (selection: string[]) => void
}) {
  const pods = byPod(targets)

  const toggle = (key: string) =>
    onChange(selection.includes(key) ? selection.filter((item) => item !== key) : [...selection, key])

  return (
    <Menu.Root>
      <Menu.Trigger className="flex max-w-52 items-center gap-1 rounded border border-line bg-base px-1.5 py-1 text-xs text-muted outline-none transition-colors hover:text-text data-[state=open]:border-accent/60">
        <span className="truncate">{summary(targets, selection)}</span>
        <ChevronDown className="size-3 shrink-0" />
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Content
          align="start"
          sideOffset={4}
          className="z-50 max-h-96 min-w-64 overflow-y-auto rounded-md border border-line-strong bg-overlay p-1 text-sm shadow-xl"
        >
          <div className="flex gap-1 px-1 pb-1">
            <button
              onClick={() => onChange(targets.map(targetKey))}
              className="rounded px-1.5 py-0.5 text-xs text-muted hover:bg-raised hover:text-text"
            >
              Select all
            </button>
            <button
              onClick={() => onChange([])}
              className="rounded px-1.5 py-0.5 text-xs text-muted hover:bg-raised hover:text-text"
            >
              Clear
            </button>
          </div>

          {pods.map(([pod, containers]) => (
            <div key={pod}>
              {pods.length > 1 && (
                <div className="truncate px-2 pb-0.5 pt-1.5 font-mono text-2xs text-faint">
                  {pod}
                </div>
              )}

              {containers.map((target) => {
                const key = targetKey(target)
                return (
                  <Menu.CheckboxItem
                    key={key}
                    checked={selection.includes(key)}
                    onSelect={(event) => {
                      event.preventDefault()
                      toggle(key)
                    }}
                    className="flex cursor-default items-center gap-2 rounded px-2 py-1.5 text-muted outline-none data-[highlighted]:bg-raised data-[highlighted]:text-text"
                  >
                    <span className="grid size-3.5 shrink-0 place-items-center rounded-[3px] border border-line-strong">
                      <Menu.ItemIndicator>
                        <Check className="size-3" />
                      </Menu.ItemIndicator>
                    </span>

                    <span className="truncate">{target.container}</span>
                    {ROLES[target.role] && (
                      <span className="shrink-0 text-2xs uppercase tracking-wide text-faint">
                        {ROLES[target.role]}
                      </span>
                    )}
                    <span
                      className={cn(
                        'ml-auto shrink-0 text-2xs',
                        target.restarts > 0 ? 'text-warn' : 'text-faint',
                      )}
                    >
                      {target.restarts > 0 ? `↻${target.restarts}` : target.state}
                    </span>
                  </Menu.CheckboxItem>
                )
              })}
            </div>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
