import { Apply, Delete, Events, Get, Owners, Scale } from '@bindings/go/app/ResourceAPI'
import type { domain } from '@bindings/go/models'
import { useClusters } from '@/features/clusters/cluster.store'
import type { Kind } from './kinds'
import { fixtureEvents, fixtureObjects, fixtureOwners } from './resource.fixtures'
import type { EventRecord, K8sObject, OwnerRef, ResourceRef } from './resource.types'

export function refOf(clusterId: string, kind: Kind, object: K8sObject): ResourceRef {
  return {
    clusterId,
    gvr: kind.gvr,
    namespace: object.metadata.namespace ?? '',
    name: object.metadata.name,
    uid: object.metadata.uid,
  }
}

const offline = () => useClusters.getState().offline

const send = (ref: ResourceRef) => ref as domain.ResourceRef

function requireCluster() {
  if (offline()) throw new Error('Offline — connect a cluster to change resources')
}

function fixture(ref: ResourceRef): K8sObject {
  const object = fixtureObjects(ref.gvr.resource).find((item) => item.metadata.uid === ref.uid)
  if (!object) throw new Error(`${ref.name} is not in the fixture data`)
  return object
}

export async function getObject(ref: ResourceRef): Promise<K8sObject> {
  if (offline()) return fixture(ref)
  return (await Get(send(ref))) as K8sObject
}

export async function applyObject(ref: ResourceRef, object: K8sObject): Promise<K8sObject> {
  requireCluster()
  return (await Apply(send(ref), object)) as K8sObject
}

export async function deleteObject(ref: ResourceRef): Promise<void> {
  requireCluster()
  await Delete(send(ref))
}

export async function scaleObject(ref: ResourceRef, replicas: number): Promise<void> {
  requireCluster()
  await Scale(send(ref), replicas)
}

export async function listOwners(ref: ResourceRef): Promise<OwnerRef[]> {
  if (offline()) return fixtureOwners(fixture(ref))
  return await Owners(send(ref))
}

export async function listEvents(ref: ResourceRef): Promise<EventRecord[]> {
  if (offline()) return fixtureEvents(fixture(ref))
  return await Events(send(ref))
}
