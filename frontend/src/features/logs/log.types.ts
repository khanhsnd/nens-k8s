export type ContainerRole = 'init' | 'app' | 'ephemeral'

export type LogTarget = {
  namespace: string
  pod: string
  container: string
  role: ContainerRole
  state: string
  restarts: number
}

export type LogOptions = {
  follow: boolean
  tailLines: number
  sinceSeconds: number
  timestamps: boolean
  previous: boolean
}

export type LogChunk = {
  token: string
  lines: string[] | null
  dropped: number
  done: boolean
  error?: string
}

export type LogLine = {
  n: number
  label: string
  time: string
  text: string
}

export type LogSearch = {
  query: string
  regex: boolean
  caseSensitive: boolean
  filter: boolean
}

export const targetKey = (target: LogTarget) => `${target.pod}/${target.container}`
