import { encodeBase64 } from '@/shared/lib/base64'
import type { ExecChunk } from './exec.types'

export type FixtureShell = {
  input: (data: string) => void
  stop: () => void
}

const BACKSPACE = '\x7f'
const INTERRUPT = '\x03'
const CLEAR = '\x1b[2J\x1b[H'

const OUTPUT: Record<string, string> = {
  ls: 'bin   dev   etc   home  proc  root  sys   tmp   usr   var',
  pwd: '/',
  whoami: 'root',
  hostname: 'api-7d4f8b9c6-x2k9p',
  uname: 'Linux api-7d4f8b9c6-x2k9p 6.6.0 x86_64 GNU/Linux',
  ps: '  PID USER     COMMAND\n    1 root     /app/server\n   14 root     sh',
}

/** A shell that behaves enough like one to exercise the panel offline. */
export function fixtureShell(
  token: string,
  container: string,
  emit: (chunk: ExecChunk) => void,
): FixtureShell {
  const prompt = `${container}:/ # `
  let line = ''
  let closed = false

  const write = (text: string, done = false) =>
    emit({ token, data: encodeBase64(text), done, error: undefined })

  const run = (command: string) => {
    const [name] = command.trim().split(/\s+/)
    if (name === '') return ''
    if (name === 'clear') return CLEAR
    if (name === 'exit') return 'exit\r\n'
    if (name in OUTPUT) return `${OUTPUT[name]}\r\n`
    return `sh: ${name}: not found\r\n`
  }

  const banner = setTimeout(() => write(`Offline shell — no cluster attached.\r\n${prompt}`), 40)

  return {
    input: (data) => {
      if (closed) return

      for (const key of data) {
        if (key === '\r') {
          const command = line
          line = ''
          write('\r\n')
          if (command.trim() === 'exit') {
            closed = true
            write('exit\r\n', true)
            return
          }
          write(run(command) + prompt)
          continue
        }
        if (key === BACKSPACE) {
          if (line === '') continue
          line = line.slice(0, -1)
          write('\b \b')
          continue
        }
        if (key === INTERRUPT) {
          line = ''
          write(`^C\r\n${prompt}`)
          continue
        }
        if (key >= ' ') {
          line += key
          write(key)
        }
      }
    },

    stop: () => {
      closed = true
      clearTimeout(banner)
    },
  }
}
