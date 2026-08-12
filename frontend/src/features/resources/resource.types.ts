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
  }
  spec?: Record<string, any>
  status?: Record<string, any>
  data?: Record<string, string>
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
