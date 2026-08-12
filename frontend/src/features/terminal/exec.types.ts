export type ExecOptions = {
  command: string[]
  tty: boolean
  cols: number
  rows: number
}

export type ExecChunk = {
  token: string
  data: string
  done: boolean
  error?: string
}

export const SHELLS: Array<readonly [string, string]> = [
  ['sh', 'sh'],
  ['bash', 'bash'],
  ['ash', 'ash'],
  ['zsh', 'zsh'],
]
