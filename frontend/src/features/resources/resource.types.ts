import type { Column } from '@/shared/ui/DataGrid'

export type GVR = {
  group: string
  version: string
  resource: string
}

export type K8sObject = {
  apiVersion?: string
  kind?: string
  metadata: {
    uid: string
    name: string
    namespace?: string
    creationTimestamp?: string
    deletionTimestamp?: string
    labels?: Record<string, string>
    annotations?: Record<string, string>
    ownerReferences?: Array<{ kind: string; name: string; uid?: string; controller?: boolean }>
  }
  spec?: Record<string, any>
  status?: Record<string, any>
  data?: Record<string, string>
  metrics?: { cpu?: string; memory?: string }
}

export type ResourceRef = {
  clusterId: string
  gvr: GVR
  namespace: string
  name: string
  uid: string
}

export type OwnerRef = {
  gvr: GVR
  kind: string
  name: string
  namespace: string
  uid: string
}

export type EventRecord = {
  type: string
  reason: string
  message: string
  source: string
  count: number
  last: string
}

export type ResourceColumn = Column<K8sObject>

export type ResourceEvent = {
  type: 'added' | 'modified' | 'deleted'
  uid: string
  object?: K8sObject
}

export type ResourceBatch = {
  token: string
  reset: boolean
  synced: boolean
  error?: string
  events: ResourceEvent[] | null
}
