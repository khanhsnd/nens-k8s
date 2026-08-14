import { FileSearch, FolderOpen, FolderSearch, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { configDir, revealPath } from '@/features/settings/settings.api'
import { cn } from '@/shared/lib/cn'
import { Dialog } from '@/shared/ui/Dialog'
import { useClusters } from './cluster.store'
import { useKubeconfigs } from './kubeconfig.store'

const MODES = [
  { id: 'file', label: 'From disk' },
  { id: 'paste', label: 'Paste' },
] as const

type Mode = (typeof MODES)[number]['id']

export function AddClusterDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const offline = useClusters((s) => s.offline)
  const files = useKubeconfigs((s) => s.files)
  const error = useKubeconfigs((s) => s.error)
  const busy = useKubeconfigs((s) => s.busy)
  const load = useKubeconfigs((s) => s.load)
  const pick = useKubeconfigs((s) => s.pick)
  const pickFolder = useKubeconfigs((s) => s.pickFolder)
  const add = useKubeconfigs((s) => s.add)
  const paste = useKubeconfigs((s) => s.paste)
  const remove = useKubeconfigs((s) => s.remove)

  const [mode, setMode] = useState<Mode>('file')
  const [path, setPath] = useState('')
  const [content, setContent] = useState('')
  const [dir, setDir] = useState('')

  useEffect(() => {
    if (!open) return
    void load()
    void configDir().then(setDir)
  }, [open, load])

  if (!open) return null

  const browse = async (dialog: () => Promise<string>) => {
    const picked = await dialog()
    if (picked) setPath(picked)
  }

  const submit = async () => {
    const added = mode === 'file' ? await add(path) : await paste(content)
    if (!added) return
    setPath('')
    setContent('')
    onClose()
  }

  const ready = mode === 'file' ? path.trim() !== '' : content.trim() !== ''

  return (
    <Dialog title="Add kubeconfig" onClose={onClose}>
      <div className="space-y-3 p-4">
        <div className="flex gap-1 rounded-md bg-raised p-0.5">
          {MODES.map((item) => (
            <button
              key={item.id}
              onClick={() => setMode(item.id)}
              className={cn(
                'flex-1 rounded px-2 py-1 text-sm transition-colors',
                mode === item.id ? 'bg-overlay text-text' : 'text-muted hover:text-text',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {mode === 'file' ? (
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <input
                value={path}
                onChange={(event) => setPath(event.target.value)}
                placeholder="C:\Users\you\.kube\config"
                className="flex-1 rounded-md border border-line bg-base px-2.5 py-1.5 font-mono text-sm text-text outline-none placeholder:text-faint focus:border-accent/60"
              />
              <button
                onClick={() => void browse(pick)}
                title="Pick one kubeconfig file"
                className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-raised hover:text-text"
              >
                <FileSearch className="size-3.5" />
                File
              </button>
              <button
                onClick={() => void browse(pickFolder)}
                title="Pick a folder of kubeconfigs"
                className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-raised hover:text-text"
              >
                <FolderOpen className="size-3.5" />
                Folder
              </button>
            </div>
            <p className="text-xs text-faint">
              A folder adds every kubeconfig directly inside it; anything else in it is skipped.
            </p>
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            spellCheck={false}
            placeholder={'apiVersion: v1\nkind: Config\nclusters:\n  - name: ...'}
            className="h-52 w-full resize-none rounded-md border border-line bg-base px-2.5 py-2 font-mono text-xs leading-relaxed text-text outline-none placeholder:text-faint focus:border-accent/60"
          />
        )}

        {mode === 'paste' && (
          <p className="flex items-center gap-1.5 text-xs text-faint">
            <span className="min-w-0 truncate">
              Written to a file in the <span className="font-mono">kubeconfigs</span> folder under{' '}
              <span className="font-mono">{dir || 'the Nens config directory'}</span>
            </span>
            {dir && (
              <button
                onClick={() => void revealPath(dir)}
                title="Open that folder"
                className="grid size-5 shrink-0 place-items-center rounded text-faint transition-colors hover:bg-raised hover:text-text"
              >
                <FolderSearch className="size-3.5" />
              </button>
            )}
          </p>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}
        {offline && !error && (
          <p className="text-xs text-warn">
            Managing kubeconfigs needs the desktop app — the browser preview has no bridge.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:bg-raised hover:text-text"
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={!ready || busy}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-base transition-opacity disabled:opacity-40"
          >
            {busy ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>

      {files.length > 0 && (
        <div className="border-t border-line px-4 py-3">
          <div className="pb-1.5 text-2xs uppercase tracking-wide text-faint">Sources</div>
          <ul className="space-y-0.5">
            {files.map((file) => (
              <li key={file.path} className="flex items-center gap-2 text-xs">
                <span className="truncate font-mono text-muted" title={file.path}>
                  {file.path}
                </span>
                <span className={cn('ml-auto shrink-0', file.error ? 'text-danger' : 'text-faint')}>
                  {file.error ? 'unreadable' : `${file.contexts} contexts`}
                </span>
                <button
                  onClick={() => void revealPath(file.path)}
                  title="Show this file in the file manager"
                  className="grid size-6 shrink-0 place-items-center rounded text-faint transition-colors hover:bg-raised hover:text-text"
                >
                  <FolderSearch className="size-3.5" />
                </button>
                {file.removable && (
                  <button
                    onClick={() => void remove(file.path)}
                    title="Remove this source"
                    className="grid size-6 shrink-0 place-items-center rounded text-faint transition-colors hover:bg-raised hover:text-danger"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  )
}
