import type { Cluster } from './cluster.types'

export const FIXTURE_CLUSTERS: Cluster[] = [
  {
    id: 'prod-sgn',
    name: 'prod-sgn',
    context: 'prod-sgn',
    server: 'https://10.20.0.1:6443',
    user: 'khanh',
    namespace: 'default',
    phase: 'connected',
    version: 'v1.31.4',
    error: '',
  },
  {
    id: 'staging-hcm',
    name: 'staging-hcm',
    context: 'staging-hcm',
    server: 'https://10.30.0.1:6443',
    user: 'khanh',
    namespace: 'staging',
    phase: 'disconnected',
    version: 'v1.30.6',
    error: '',
  },
  {
    id: 'kind-local',
    name: 'kind-local',
    context: 'kind-local',
    server: 'https://127.0.0.1:52193',
    user: 'kind',
    namespace: 'default',
    phase: 'disconnected',
    version: 'v1.32.0',
    error: '',
  },
]
