import { Boxes, Database, FileCog, Gauge, Network, Puzzle, ShieldCheck, Ship } from 'lucide-react'
import type { ComponentType } from 'react'

export type NavLeaf = {
  id: string
  label: string
}

export type NavSection = {
  id: string
  label: string
  /** The long form behind a shortened label: shown on hover, matched by the filter. */
  hint?: string
  icon: ComponentType<{ className?: string }>
  children: NavLeaf[]
}

/**
 * The curated half of the tree: which built-in kinds are worth a leaf, how they
 * group and what they are called. Discovery decides which of them the cluster
 * actually serves and appends its custom groups — see `nav.tree.ts`.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'cluster',
    label: 'Cluster',
    icon: Gauge,
    children: [
      { id: 'overview', label: 'Overview' },
      { id: 'topology', label: 'Topology' },
      { id: 'nodes', label: 'Nodes' },
      { id: 'namespaces', label: 'Namespaces' },
      { id: 'events', label: 'Events' },
    ],
  },
  {
    id: 'workloads',
    label: 'Workloads',
    icon: Boxes,
    children: [
      { id: 'pods', label: 'Pods' },
      { id: 'deployments', label: 'Deployments' },
      { id: 'daemonsets', label: 'DaemonSets' },
      { id: 'statefulsets', label: 'StatefulSets' },
      { id: 'replicasets', label: 'ReplicaSets' },
      { id: 'jobs', label: 'Jobs' },
      { id: 'cronjobs', label: 'CronJobs' },
    ],
  },
  {
    id: 'config',
    label: 'Config',
    icon: FileCog,
    children: [
      { id: 'configmaps', label: 'ConfigMaps' },
      { id: 'secrets', label: 'Secrets' },
      { id: 'resourcequotas', label: 'Resource Quotas' },
      { id: 'limitranges', label: 'Limit Ranges' },
      { id: 'hpa', label: 'Autoscalers' },
      { id: 'pdb', label: 'Disruption Budgets' },
      { id: 'priorityclasses', label: 'Priority Classes' },
    ],
  },
  {
    id: 'network',
    label: 'Network',
    icon: Network,
    children: [
      { id: 'services', label: 'Services' },
      { id: 'endpoints', label: 'Endpoints' },
      { id: 'ingresses', label: 'Ingresses' },
      { id: 'ingressclasses', label: 'Ingress Classes' },
      { id: 'networkpolicies', label: 'Network Policies' },
      { id: 'portforward', label: 'Port Forwarding' },
    ],
  },
  {
    id: 'storage',
    label: 'Storage',
    icon: Database,
    children: [
      { id: 'pvc', label: 'Persistent Volume Claims' },
      { id: 'pv', label: 'Persistent Volumes' },
      { id: 'storageclasses', label: 'Storage Classes' },
    ],
  },
  {
    id: 'helm',
    label: 'Helm',
    icon: Ship,
    children: [{ id: 'releases', label: 'Releases' }],
  },
  {
    id: 'access',
    label: 'Access Control',
    icon: ShieldCheck,
    children: [
      { id: 'serviceaccounts', label: 'Service Accounts' },
      { id: 'clusterroles', label: 'Cluster Roles' },
      { id: 'roles', label: 'Roles' },
      { id: 'clusterrolebindings', label: 'Cluster Role Bindings' },
      { id: 'rolebindings', label: 'Role Bindings' },
    ],
  },
  {
    id: 'crd',
    label: 'Custom Resources',
    icon: Puzzle,
    children: [{ id: 'definitions', label: 'Definitions' }],
  },
]

export const CUSTOM_SECTION_ICON = Puzzle
