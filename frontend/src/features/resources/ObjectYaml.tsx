import { RotateCcw, Save } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { CodeEditor } from '@/shared/ui/CodeEditor'
import { parse, stringify } from 'yaml'
import { useEditorGuard } from './editor.store'
import { applyObject, getObject } from './object.api'
import type { K8sObject, ResourceRef } from './resource.types'

const toYaml = (object: K8sObject) => stringify(object, { lineWidth: 0 })

export function ObjectYaml({ target }: { target: ResourceRef }) {
  const setDirty = useEditorGuard((s) => s.setDirty)
  const [saved, setSaved] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const next = toYaml(await getObject(target))
      setSaved(next)
      setText(next)
    } catch (failure) {
      setError(String(failure))
    } finally {
      setBusy(false)
    }
  }, [target])

  const apply = useCallback(async () => {
    let edited: K8sObject
    try {
      edited = parse(text) as K8sObject
    } catch (failure) {
      setError(String(failure))
      return
    }

    setBusy(true)
    setError(null)
    try {
      const next = toYaml(await applyObject(target, edited))
      setSaved(next)
      setText(next)
    } catch (failure) {
      setError(String(failure))
    } finally {
      setBusy(false)
    }
  }, [target, text])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setDirty(text !== saved)
  }, [text, saved, setDirty])

  useEffect(() => () => setDirty(false), [setDirty])

  const dirty = text !== saved

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-2 text-xs">
        <span className={dirty ? 'text-warn' : 'text-faint'}>
          {dirty ? 'unsaved changes' : 'in sync with the cluster'}
        </span>

        <button
          onClick={() => void load()}
          disabled={busy}
          title="Reload from the cluster"
          className="ml-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-muted transition-colors hover:bg-raised hover:text-text disabled:opacity-40"
        >
          <RotateCcw className="size-3.5" />
          Reload
        </button>
        <button
          onClick={() => void apply()}
          disabled={busy || !dirty}
          title="Server-side apply (Ctrl+S)"
          className="flex items-center gap-1.5 rounded-md bg-accent px-2 py-1 font-medium text-base transition-opacity disabled:opacity-40"
        >
          <Save className="size-3.5" />
          Apply
        </button>
      </div>

      {error && (
        <div className="shrink-0 border-b border-line bg-raised px-3 py-2 font-mono text-xs text-danger">
          {error}
        </div>
      )}

      <CodeEditor value={text} onChange={setText} onSave={() => void apply()} />
    </div>
  )
}
