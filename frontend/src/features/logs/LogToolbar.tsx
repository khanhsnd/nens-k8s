import {
  ArrowDownToLine,
  CaseSensitive,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Download,
  Eraser,
  History,
  ListFilter,
  Regex,
  Search,
  WrapText,
  type LucideIcon,
} from 'lucide-react'
import type { ContainerTarget } from '@/features/containers/container.types'
import { cn } from '@/shared/lib/cn'
import { CAPACITIES } from './log.buffer'
import type { LogSearch } from './log.types'
import { TargetPicker } from './TargetPicker'

export type LogControls = {
  tail: number
  since: number
  previous: boolean
  timestamps: boolean
  capacity: number
  wrap: boolean
  follow: boolean
}

const TAILS = [
  [100, 'tail 100'],
  [500, 'tail 500'],
  [1000, 'tail 1k'],
  [5000, 'tail 5k'],
  [0, 'tail all'],
] as const

const SINCES = [
  [0, 'all time'],
  [300, 'last 5m'],
  [900, 'last 15m'],
  [3600, 'last 1h'],
  [21600, 'last 6h'],
  [86400, 'last 24h'],
] as const

function Choice({
  value,
  options,
  title,
  onChange,
}: {
  value: number
  options: ReadonlyArray<readonly [number, string]>
  title: string
  onChange: (value: number) => void
}) {
  return (
    <select
      value={value}
      title={title}
      onChange={(event) => onChange(Number(event.target.value))}
      className="rounded border border-line bg-base px-1.5 py-1 text-[11px] text-muted outline-none transition-colors hover:text-text focus:border-accent/60"
    >
      {options.map(([option, label]) => (
        <option key={option} value={option}>
          {label}
        </option>
      ))}
    </select>
  )
}

function Toggle({
  icon: Icon,
  title,
  on,
  disabled,
  onClick,
}: {
  icon: LucideIcon
  title: string
  on: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded transition-colors disabled:opacity-30',
        on ? 'bg-accent-dim text-accent' : 'text-muted hover:bg-raised hover:text-text',
      )}
    >
      <Icon className="size-3.5" />
    </button>
  )
}

function Action({ icon: Icon, title, onClick }: { icon: LucideIcon; title: string; onClick: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="grid size-6 shrink-0 place-items-center rounded text-muted transition-colors hover:bg-raised hover:text-text"
    >
      <Icon className="size-3.5" />
    </button>
  )
}

export function LogToolbar({
  targets,
  selection,
  onSelection,
  controls,
  onControls,
  search,
  onSearch,
  matches,
  cursor,
  onStep,
  onClear,
  onCopy,
  onDownload,
}: {
  targets: ContainerTarget[]
  selection: string[]
  onSelection: (selection: string[]) => void
  controls: LogControls
  onControls: (changes: Partial<LogControls>) => void
  search: LogSearch
  onSearch: (changes: Partial<LogSearch>) => void
  matches: number
  cursor: number
  onStep: (delta: number) => void
  onClear: () => void
  onCopy: () => void
  onDownload: () => void
}) {
  return (
    <div className="shrink-0 border-b border-line">
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5">
        <TargetPicker targets={targets} selection={selection} onChange={onSelection} />
        <Choice
          value={controls.tail}
          options={TAILS}
          title="How many lines to load before following"
          onChange={(tail) => onControls({ tail })}
        />
        <Choice
          value={controls.since}
          options={SINCES}
          title="Only lines newer than"
          onChange={(since) => onControls({ since })}
        />

        <span className="mx-0.5 h-4 w-px bg-line" />

        <Toggle
          icon={History}
          title="Logs of the previous, crashed container"
          on={controls.previous}
          onClick={() => onControls({ previous: !controls.previous })}
        />
        <Toggle
          icon={Clock}
          title="Show timestamps"
          on={controls.timestamps}
          onClick={() => onControls({ timestamps: !controls.timestamps })}
        />
        <Toggle
          icon={WrapText}
          title="Wrap long lines"
          on={controls.wrap}
          onClick={() => onControls({ wrap: !controls.wrap })}
        />
        <Toggle
          icon={ArrowDownToLine}
          title="Follow the tail"
          on={controls.follow}
          onClick={() => onControls({ follow: !controls.follow })}
        />

        <span className="ml-auto flex items-center gap-1">
          <Choice
            value={controls.capacity}
            options={CAPACITIES.map((size) => [size, `${size / 1000}k buffer`] as const)}
            title="Lines kept in memory"
            onChange={(capacity) => onControls({ capacity })}
          />
          <Action icon={Eraser} title="Clear the buffer" onClick={onClear} />
          <Action icon={Copy} title="Copy what is shown" onClick={onCopy} />
          <Action icon={Download} title="Download what is shown" onClick={onDownload} />
        </span>
      </div>

      <div className="flex items-center gap-1 border-t border-line/60 px-2 py-1">
        <Search className="size-3.5 shrink-0 text-faint" />
        <input
          value={search.query}
          placeholder="Search — Enter for the next match"
          onChange={(event) => onSearch({ query: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onStep(event.shiftKey ? -1 : 1)
            if (event.key === 'Escape') onSearch({ query: '' })
          }}
          className="min-w-0 flex-1 bg-transparent px-1 py-0.5 text-[12px] text-text outline-none placeholder:text-faint"
        />

        {search.query !== '' && (
          <span className="shrink-0 tabular-nums text-[11px] text-faint">
            {matches === 0 ? 'no match' : `${cursor + 1}/${matches}`}
          </span>
        )}

        <Toggle
          icon={CaseSensitive}
          title="Match case"
          on={search.caseSensitive}
          onClick={() => onSearch({ caseSensitive: !search.caseSensitive })}
        />
        <Toggle
          icon={Regex}
          title="Regular expression"
          on={search.regex}
          onClick={() => onSearch({ regex: !search.regex })}
        />
        <Toggle
          icon={ListFilter}
          title="Show only matching lines"
          on={search.filter}
          onClick={() => onSearch({ filter: !search.filter })}
        />
        <Action icon={ChevronUp} title="Previous match (Shift+Enter)" onClick={() => onStep(-1)} />
        <Action icon={ChevronDown} title="Next match (Enter)" onClick={() => onStep(1)} />
      </div>
    </div>
  )
}
