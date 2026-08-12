import { stripAnsi } from '@/shared/lib/ansi'
import { matcher, type Matcher } from './log.search'
import type { LogLine, LogSearch } from './log.types'

export const CAPACITIES = [10_000, 50_000, 200_000]

// Trimming a tenth of the buffer at a time keeps the splice off the hot path.
const TRIM_SLACK = 0.1

const STAMP = /^(\d{4}-\d\d-\d\dT[\d:.]+Z?) (.*)$/

/**
 * The scrollback of one log session: a capped array of lines plus the index of
 * the lines matching the current search. Both grow incrementally as chunks
 * arrive, so streaming never rescans what is already in memory.
 */
export class LogBuffer {
  private lines: LogLine[] = []
  private matches: number[] = []
  private match: Matcher | null = null
  private filtering = false
  private next = 1

  /** Lines the backend had to drop under backpressure — a real gap in the log. */
  dropped = 0

  constructor(private limit: number) {}

  get total() {
    return this.next - 1
  }

  get capacity() {
    return this.limit
  }

  set capacity(limit: number) {
    this.limit = limit
    this.trim()
  }

  push(label: string, texts: string[], dropped: number) {
    this.dropped += dropped

    for (const text of texts) {
      const line = parse(this.next++, label, text)
      if (this.match?.test(line.text)) this.matches.push(this.lines.length)
      this.lines.push(line)
    }
    this.trim()
  }

  search(search: LogSearch) {
    this.match = matcher(search)
    this.filtering = search.filter && this.match !== null
    this.reindex()
  }

  clear() {
    this.lines = []
    this.matches = []
    this.dropped = 0
    this.next = 1
  }

  /** Rows the view should render — every line, or only the matching ones. */
  size() {
    return this.filtering ? this.matches.length : this.lines.length
  }

  at(index: number): LogLine | undefined {
    return this.filtering ? this.lines[this.matches[index]] : this.lines[index]
  }

  matchCount() {
    return this.match ? this.matches.length : 0
  }

  /** Where the nth match sits in the current view, so it can be scrolled to. */
  rowOfMatch(nth: number) {
    return this.filtering ? nth : (this.matches[nth] ?? 0)
  }

  spansOf(text: string) {
    return this.match?.spans(text) ?? []
  }

  text() {
    const out: string[] = []
    for (let i = 0; i < this.size(); i++) {
      const line = this.at(i)
      if (line) out.push([line.label, line.time, line.text].filter(Boolean).join(' '))
    }
    return out.join('\n')
  }

  private trim() {
    const excess = this.lines.length - this.limit
    if (excess <= 0 || excess < this.limit * TRIM_SLACK) return

    this.lines.splice(0, excess)
    this.matches = this.matches.filter((at) => at >= excess).map((at) => at - excess)
  }

  private reindex() {
    this.matches = []
    if (!this.match) return

    for (let i = 0; i < this.lines.length; i++) {
      if (this.match.test(this.lines[i].text)) this.matches.push(i)
    }
  }
}

function parse(n: number, label: string, raw: string): LogLine {
  // Tabs are expanded here so a wrapped row is exactly `characters / columns` high.
  const clean = stripAnsi(raw)
  const text = clean.includes('\t') ? clean.replaceAll('\t', '    ') : clean

  const stamp = STAMP.exec(text)
  return stamp ? { n, label, time: stamp[1], text: stamp[2] } : { n, label, time: '', text }
}
