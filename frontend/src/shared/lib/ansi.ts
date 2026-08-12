const ESC = String.fromCharCode(27)

// CSI sequences — colours and cursor moves, which is all a log line ever carries.
const CSI = new RegExp(`${ESC}\\[[0-9;?]*[ -/]*[@-~]`, 'g')

export function stripAnsi(text: string): string {
  return text.includes(ESC) ? text.replace(CSI, '') : text
}
