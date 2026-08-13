import { yaml } from '@codemirror/lang-yaml'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorState, Prec } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { basicSetup } from 'codemirror'
import { useEffect, useRef } from 'react'

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--color-base)', color: 'var(--color-text)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', lineHeight: '1.6' },
  '.cm-content': { userSelect: 'text', caretColor: 'var(--color-accent)' },
  '.cm-gutters': {
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-faint)',
    borderRight: '1px solid var(--color-line)',
  },
  '.cm-activeLine': { backgroundColor: 'var(--color-raised)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--color-raised)', color: 'var(--color-muted)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-accent)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--color-accent-dim)',
  },
  '.cm-searchMatch, .cm-selectionMatch': { backgroundColor: 'var(--color-accent-dim)' },
  '.cm-panels': {
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text)',
    borderColor: 'var(--color-line)',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--color-raised)',
    color: 'var(--color-muted)',
    border: 'none',
  },
})

const highlight = HighlightStyle.define([
  { tag: [tags.propertyName, tags.definition(tags.propertyName)], color: 'var(--color-accent)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--color-ok)' },
  { tag: [tags.number, tags.bool, tags.atom, tags.null], color: 'var(--color-info)' },
  { tag: tags.keyword, color: 'var(--color-warn)' },
  { tag: tags.comment, color: 'var(--color-faint)', fontStyle: 'italic' },
  { tag: tags.meta, color: 'var(--color-faint)' },
])

/** Read-only when nobody wants the changes: no `onChange`, no editing. */
export function CodeEditor({
  value,
  onChange,
  onSave,
}: {
  value: string
  onChange?: (text: string) => void
  onSave?: () => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const handlers = useRef({ onChange, onSave })
  handlers.current = { onChange, onSave }

  useEffect(() => {
    const editor = new EditorView({
      parent: host.current ?? undefined,
      state: EditorState.create({
        extensions: [
          basicSetup,
          yaml(),
          theme,
          syntaxHighlighting(highlight),
          EditorState.readOnly.of(!onChange),
          EditorView.editable.of(Boolean(onChange)),
          Prec.highest(
            keymap.of([
              {
                key: 'Mod-s',
                preventDefault: true,
                run: () => {
                  handlers.current.onSave?.()
                  return true
                },
              },
            ]),
          ),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) handlers.current.onChange?.(update.state.doc.toString())
          }),
        ],
      }),
    })

    view.current = editor
    return () => {
      editor.destroy()
      view.current = null
    }
  }, [])

  useEffect(() => {
    const editor = view.current
    if (!editor || editor.state.doc.toString() === value) return

    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } })
  }, [value])

  return <div ref={host} className="min-h-0 flex-1 overflow-hidden" />
}
