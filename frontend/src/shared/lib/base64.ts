export function decodeBase64(data: string): Uint8Array {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function encodeBase64(text: string): string {
  let binary = ''
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte)
  return btoa(binary)
}
