export type ContainerRole = 'init' | 'app' | 'ephemeral'

export type ContainerTarget = {
  namespace: string
  pod: string
  container: string
  role: ContainerRole
  state: string
  restarts: number
}

export const targetKey = (target: ContainerTarget) => `${target.pod}/${target.container}`
