import { create } from 'zustand'
import { Subscribe, Unsubscribe } from '@bindings/go/app/ResourceAPI'
import { EventsOn } from '@bindings/runtime/runtime'
import { useClusters } from '@/features/clusters/cluster.store'
import type { Kind } from './kinds'
import { fixtureObjects } from './resource.fixtures'
import type { K8sObject, ResourceBatch } from './resource.types'

export type ResourceSlice = {
  objects: Map<string, K8sObject>
  synced: boolean
  error: string | null
}

type ResourceState = {
  slices: Record<string, ResourceSlice>
  sync: (clusterId: string | null, kinds: Kind[]) => Promise<void>
}

type Target = { key: string; clusterId: string; kind: Kind }

export const sliceKey = (clusterId: string, kindId: string) => `${clusterId}/${kindId}`

const PENDING = ''

const tokens = new Map<string, string>()
const owners = new Map<string, string>()
let counter = 0

function index(objects: K8sObject[]): Map<string, K8sObject> {
  return new Map(objects.map((object) => [object.metadata.uid, object]))
}

function putSlice(key: string, slice: ResourceSlice) {
  useResources.setState((state) => ({ slices: { ...state.slices, [key]: slice } }))
}

function dropSlice(key: string) {
  useResources.setState((state) => {
    const slices = { ...state.slices }
    delete slices[key]
    return { slices }
  })
}

async function acquire({ key, clusterId, kind }: Target) {
  tokens.set(key, PENDING)
  putSlice(key, { objects: new Map(), synced: false, error: null })

  if (useClusters.getState().offline) {
    putSlice(key, { objects: index(fixtureObjects(kind.id)), synced: true, error: null })
    return
  }

  counter += 1
  const token = `${key}#${counter}`
  owners.set(token, key)

  try {
    await Subscribe(token, clusterId, kind.gvr, '')
    if (tokens.get(key) !== PENDING) {
      owners.delete(token)
      void Unsubscribe(token).catch(() => {})
      return
    }
    tokens.set(key, token)
  } catch (error) {
    owners.delete(token)
    tokens.delete(key)
    putSlice(key, { objects: new Map(), synced: true, error: String(error) })
  }
}

function release(key: string) {
  const token = tokens.get(key)
  tokens.delete(key)
  dropSlice(key)

  if (token) {
    owners.delete(token)
    void Unsubscribe(token).catch(() => {})
  }
}

export const useResources = create<ResourceState>(() => ({
  slices: {},

  sync: async (clusterId, kinds) => {
    const targets: Target[] = clusterId
      ? kinds.map((kind) => ({ key: sliceKey(clusterId, kind.id), clusterId, kind }))
      : []
    const wanted = new Set(targets.map((target) => target.key))

    for (const key of [...tokens.keys()]) {
      if (!wanted.has(key)) release(key)
    }
    await Promise.all(targets.filter((target) => !tokens.has(target.key)).map(acquire))
  },
}))

let queue: ResourceBatch[] = []
let frame = 0

function drain() {
  frame = 0
  const batches = queue
  queue = []

  useResources.setState((state) => {
    const slices = { ...state.slices }
    const copied = new Set<string>()

    for (const batch of batches) {
      const key = owners.get(batch.token)
      const current = key ? slices[key] : undefined
      if (!key || !current) continue

      let objects = current.objects
      if (batch.reset) objects = new Map()
      else if (!copied.has(key)) objects = new Map(objects)
      copied.add(key)

      for (const item of batch.events ?? []) {
        if (item.type === 'deleted') objects.delete(item.uid)
        else if (item.object) objects.set(item.uid, item.object)
      }

      slices[key] = {
        objects,
        synced: current.synced || batch.synced,
        error: batch.error ?? null,
      }
    }
    return { slices }
  })
}

export function subscribeResourceEvents() {
  try {
    return EventsOn('resource:event', (batch: ResourceBatch) => {
      queue.push(batch)
      if (!frame) frame = requestAnimationFrame(drain)
    })
  } catch {
    return () => {}
  }
}
