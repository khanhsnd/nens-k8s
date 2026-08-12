import { FolderOpen, RotateCcw, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Dialog } from '@/shared/ui/Dialog'
import { SIZES, useAppearance } from './appearance.store'
import { configDir, revealPath } from './settings.api'

const FONT_LIST = 'nens-installed-fonts'

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] items-center gap-3 py-1.5">
      <div>
        <div className="text-sm text-muted">{label}</div>
        {hint && <div className="text-2xs text-faint">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

function FontField({
  value,
  placeholder,
  onChange,
}: {
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  return (
    <div className="relative">
      <input
        list={FONT_LIST}
        value={value}
        spellCheck={false}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-line bg-base py-1.5 pl-2.5 pr-7 text-sm text-text outline-none placeholder:text-faint focus:border-accent/60"
      />
      {value && (
        <button
          title="Back to the default"
          onClick={() => onChange('')}
          className="absolute right-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-faint transition-colors hover:bg-raised hover:text-text"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { sans, mono, size, fonts, update, reset, loadFonts } = useAppearance()
  const [dir, setDir] = useState('')

  useEffect(() => {
    void loadFonts()
    void configDir().then(setDir)
  }, [loadFonts])

  return (
    <Dialog title="Settings" onClose={onClose}>
      <datalist id={FONT_LIST}>
        {fonts.map((font) => (
          <option key={font} value={font} />
        ))}
      </datalist>

      <div className="space-y-1 p-4">
        <div className="flex items-baseline gap-2 pb-1">
          <span className="text-2xs uppercase tracking-wide text-faint">Appearance</span>
          <span className="text-2xs text-faint">
            {fonts.length > 0 ? `${fonts.length} fonts installed` : 'reading installed fonts…'}
          </span>
          <button
            onClick={reset}
            className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs text-faint transition-colors hover:bg-raised hover:text-text"
          >
            <RotateCcw className="size-3" />
            Reset
          </button>
        </div>

        <Row label="Interface font" hint="Everything but logs">
          <FontField
            value={sans}
            placeholder="Segoe UI Variable Text"
            onChange={(value) => update({ sans: value })}
          />
        </Row>

        <Row label="Monospace font" hint="Logs, shells, YAML">
          <FontField
            value={mono}
            placeholder="Cascadia Mono"
            onChange={(value) => update({ mono: value })}
          />
        </Row>

        <Row label="Text size">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={SIZES.min}
              max={SIZES.max}
              step={SIZES.step}
              value={size}
              onChange={(event) => update({ size: Number(event.target.value) })}
              className="h-1 flex-1 accent-accent"
            />
            <span className="w-10 shrink-0 text-right font-mono text-sm text-muted">{size}px</span>
          </div>
        </Row>
      </div>

      <div className="border-t border-line px-4 py-3">
        <div className="pb-1.5 text-2xs uppercase tracking-wide text-faint">Files</div>
        <div className="flex items-center gap-2 text-xs">
          <span className="min-w-0 flex-1 truncate font-mono text-muted" title={dir}>
            {dir || 'the desktop app keeps settings.json and imported kubeconfigs here'}
          </span>
          {dir && (
            <button
              onClick={() => void revealPath(dir)}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-raised hover:text-text"
            >
              <FolderOpen className="size-3.5" />
              Open folder
            </button>
          )}
        </div>
      </div>
    </Dialog>
  )
}
