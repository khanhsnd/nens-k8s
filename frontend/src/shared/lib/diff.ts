export type DiffKind = 'same' | 'add' | 'remove'

export type DiffLine = {
  kind: DiffKind
  text: string
  /** Line number in the left text; 0 on a line only the right one has. */
  before: number
  /** Line number in the right text; 0 on a line only the left one has. */
  after: number
}

export type Diff = {
  lines: DiffLine[]
  added: number
  removed: number
  /** False when the changed part was too large to align line by line. */
  exact: boolean
}

type Step = [DiffKind, string]

/**
 * The alignment is a longest-common-subsequence table, which costs one cell per
 * pair of changed lines. Two revisions of a manifest are mostly identical, so
 * the shared head and tail are matched first and only what is left is aligned —
 * that is what keeps a 3k-line manifest under a millisecond.
 */
const MAX_CELLS = 2_000_000

function split(text: string): string[] {
  if (text === '') return []
  return text.replace(/\n$/, '').split('\n')
}

function align(a: string[], b: string[]): Step[] {
  const width = b.length + 1
  const common = new Uint32Array((a.length + 1) * width)
  const at = (i: number, j: number) => i * width + j

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      common[at(i, j)] =
        a[i] === b[j]
          ? common[at(i + 1, j + 1)] + 1
          : Math.max(common[at(i + 1, j)], common[at(i, j + 1)])
    }
  }

  const steps: Step[] = []
  let i = 0
  let j = 0

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      steps.push(['same', a[i]])
      i += 1
      j += 1
    } else if (common[at(i + 1, j)] >= common[at(i, j + 1)]) {
      steps.push(['remove', a[i]])
      i += 1
    } else {
      steps.push(['add', b[j]])
      j += 1
    }
  }

  while (i < a.length) steps.push(['remove', a[i++]])
  while (j < b.length) steps.push(['add', b[j++]])
  return steps
}

/** The honest answer when aligning would cost more than it is worth. */
function replaced(a: string[], b: string[]): Step[] {
  return [
    ...a.map((text): Step => ['remove', text]),
    ...b.map((text): Step => ['add', text]),
  ]
}

export function diffLines(before: string, after: string): Diff {
  const a = split(before)
  const b = split(after)

  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1

  let tail = 0
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail += 1
  }

  const changedA = a.slice(head, a.length - tail)
  const changedB = b.slice(head, b.length - tail)
  const exact = changedA.length * changedB.length <= MAX_CELLS

  const steps: Step[] = [
    ...a.slice(0, head).map((text): Step => ['same', text]),
    ...(exact ? align(changedA, changedB) : replaced(changedA, changedB)),
    ...a.slice(a.length - tail).map((text): Step => ['same', text]),
  ]

  let beforeNo = 0
  let afterNo = 0
  let added = 0
  let removed = 0

  const lines = steps.map(([kind, text]): DiffLine => {
    if (kind !== 'add') beforeNo += 1
    if (kind !== 'remove') afterNo += 1
    if (kind === 'add') added += 1
    if (kind === 'remove') removed += 1

    return {
      kind,
      text,
      before: kind === 'add' ? 0 : beforeNo,
      after: kind === 'remove' ? 0 : afterNo,
    }
  })

  return { lines, added, removed, exact }
}
