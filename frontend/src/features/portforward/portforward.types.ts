export type ForwardStatus = 'starting' | 'active' | 'error' | 'stopped'

export type PortForward = {
  id: string
  clusterId: string
  namespace: string
  resource: string
  name: string
  pod: string
  localPort: number
  remotePort: number
  status: ForwardStatus
  error?: string
}

export type ForwardPort = {
  name: string
  port: number
  protocol: string
}

export const forwardAddress = (forward: PortForward) => `localhost:${forward.localPort}`

export const forwardTarget = (forward: PortForward) =>
  `${forward.resource}/${forward.name}:${forward.remotePort}`
