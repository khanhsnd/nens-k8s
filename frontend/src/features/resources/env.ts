import { getObject } from './object.api'
import type { K8sObject } from './resource.types'

/**
 * One variable as the kubelet would set it. `source` is where the value was read
 * from — a literal has none — and `secret` is what the eye toggle hides.
 */
export type EnvEntry = {
  name: string
  value: string
  source?: string
  secret?: boolean
  /** The reference resolved to nothing: the kubelet fails the pod unless optional. */
  missing?: boolean
  optional?: boolean
  /** Why it could not be read — RBAC on Secrets is the common one. */
  reason?: string
}

type Source = 'configmaps' | 'secrets'

type Read = { object?: K8sObject; error?: string }

type Loader = (source: Source, name: string) => Promise<Read>

/**
 * One read per referenced object per resolve, and a fresh one next time the
 * drawer opens: a ConfigMap edited underneath should show its new value.
 *
 * A failed read keeps its reason. "Forbidden" is not "missing" — plenty of
 * clusters let a user read pods and not the Secrets they mount.
 */
function loader(clusterId: string, namespace: string): Loader {
  const reads = new Map<string, Promise<Read>>()

  return (source, name) => {
    const key = `${source}/${name}`
    if (!reads.has(key)) {
      reads.set(
        key,
        getObject({
          clusterId,
          gvr: { group: '', version: 'v1', resource: source },
          namespace,
          name,
          // Only the fixtures read the uid, and theirs is `namespace/name`.
          uid: `${namespace}/${name}`,
        })
          .then((object) => ({ object }))
          .catch((error) => ({ error: String(error) })),
      )
    }
    return reads.get(key) as Promise<Read>
  }
}

function decode(value: string): string {
  try {
    const binary = atob(value)
    return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)))
  } catch {
    return value
  }
}

/** A ConfigMap's `data` is text and its `binaryData` is base64; a Secret is all base64. */
function entries(object: K8sObject, secret: boolean): Record<string, string> {
  const data = object.data ?? {}
  if (secret) return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, decode(v)]))

  const binary: Record<string, string> = (object as any).binaryData ?? {}
  return {
    ...data,
    ...Object.fromEntries(Object.entries(binary).map(([k, v]) => [k, decode(v)])),
  }
}

const label = (secret: boolean, name: string, key?: string) =>
  `${secret ? 'secret' : 'configMap'} ${name}${key ? `.${key}` : ''}`

/** `metadata.labels['app']` as well as `status.podIP`. */
function fieldValue(pod: K8sObject, path: string): string {
  const match = /^(.+)\['(.+)'\]$/.exec(path ?? '')
  const walk = (match ? match[1] : (path ?? '')).split('.')

  let current: any = pod
  for (const step of walk) current = current?.[step]
  if (match) current = current?.[match[2]]

  return current === undefined || current === null ? '' : String(current)
}

/** `limits.cpu` of this container, or of the one the ref names. */
function resourceValue(pod: K8sObject, spec: any, ref: any): string {
  const target = ref.containerName
    ? [...(pod.spec?.containers ?? []), ...(pod.spec?.initContainers ?? [])].find(
        (container: any) => container.name === ref.containerName,
      )
    : spec

  const [scope, resource] = String(ref.resource ?? '').split('.')
  return target?.resources?.[scope]?.[resource] ?? ''
}

async function fromRef(pod: K8sObject, spec: any, variable: any, load: Loader): Promise<EnvEntry> {
  const from = variable.valueFrom

  if (from.fieldRef) {
    return {
      name: variable.name,
      value: fieldValue(pod, from.fieldRef.fieldPath),
      source: `field ${from.fieldRef.fieldPath}`,
    }
  }
  if (from.resourceFieldRef) {
    return {
      name: variable.name,
      value: resourceValue(pod, spec, from.resourceFieldRef),
      source: `resource ${from.resourceFieldRef.resource}`,
    }
  }

  const secret = Boolean(from.secretKeyRef)
  const ref = from.secretKeyRef ?? from.configMapKeyRef
  if (!ref) return { name: variable.name, value: '', missing: true }

  const read = await load(secret ? 'secrets' : 'configmaps', ref.name)
  const value = read.object ? entries(read.object, secret)[ref.key] : undefined

  return {
    name: variable.name,
    value: value ?? '',
    source: label(secret, ref.name, ref.key),
    secret,
    missing: value === undefined,
    optional: Boolean(ref.optional),
    reason: read.error,
  }
}

async function fromBulk(entry: any, load: Loader, overridden: Set<string>): Promise<EnvEntry[]> {
  const secret = Boolean(entry.secretRef)
  const ref = entry.secretRef ?? entry.configMapRef
  if (!ref) return []

  const read = await load(secret ? 'secrets' : 'configmaps', ref.name)
  if (!read.object) {
    return [
      {
        name: `all of ${label(secret, ref.name)}`,
        value: '',
        source: label(secret, ref.name),
        missing: true,
        optional: Boolean(entry.optional),
        reason: read.error,
      },
    ]
  }

  const prefix = entry.prefix ?? ''
  return Object.entries(entries(read.object, secret))
    .map(([key, value]) => ({ name: prefix + key, value, source: label(secret, ref.name), secret }))
    .filter((item) => !overridden.has(item.name))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Every variable the container will see, in the kubelet's order: `envFrom` first,
 * then `env`, which is what wins when both name the same variable.
 */
export async function resolveEnv(
  pod: K8sObject,
  spec: any,
  clusterId: string,
): Promise<EnvEntry[]> {
  const load = loader(clusterId, pod.metadata.namespace ?? '')
  const own: any[] = spec.env ?? []
  const overridden = new Set<string>(own.map((variable) => variable.name))

  const bulk = await Promise.all(
    (spec.envFrom ?? []).map((entry: any) => fromBulk(entry, load, overridden)),
  )
  const resolved = await Promise.all(
    own.map((variable) =>
      variable.valueFrom
        ? fromRef(pod, spec, variable, load)
        : Promise.resolve<EnvEntry>({ name: variable.name, value: variable.value ?? '' }),
    ),
  )

  return [...bulk.flat(), ...resolved]
}
