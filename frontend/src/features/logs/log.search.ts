import type { LogSearch } from './log.types'

export type Span = [start: number, end: number]

export type Matcher = {
  test: (text: string) => boolean
  spans: (text: string) => Span[]
}

// One line can only show so many highlights before the browser gives up on it.
const MAX_SPANS = 200

export const EMPTY_SEARCH: LogSearch = {
  query: '',
  regex: false,
  caseSensitive: false,
  filter: false,
}

export function matcher({ query, regex, caseSensitive }: LogSearch): Matcher | null {
  if (query === '') return null
  return regex ? regexMatcher(query, caseSensitive) : plainMatcher(query, caseSensitive)
}

function regexMatcher(query: string, caseSensitive: boolean): Matcher | null {
  let pattern: RegExp
  try {
    pattern = new RegExp(query, caseSensitive ? 'g' : 'gi')
  } catch {
    return null
  }

  return {
    test: (text) => {
      pattern.lastIndex = 0
      return pattern.test(text)
    },
    spans: (text) => {
      const found: Span[] = []
      pattern.lastIndex = 0

      for (let hit = pattern.exec(text); hit; hit = pattern.exec(text)) {
        if (hit[0] === '') pattern.lastIndex += 1
        else found.push([hit.index, hit.index + hit[0].length])
        if (found.length >= MAX_SPANS) break
      }
      return found
    },
  }
}

function plainMatcher(query: string, caseSensitive: boolean): Matcher {
  const needle = caseSensitive ? query : query.toLowerCase()
  const fold = (text: string) => (caseSensitive ? text : text.toLowerCase())

  return {
    test: (text) => fold(text).includes(needle),
    spans: (text) => {
      const found: Span[] = []
      const haystack = fold(text)

      for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + needle.length)) {
        found.push([at, at + needle.length])
        if (found.length >= MAX_SPANS) break
      }
      return found
    },
  }
}
