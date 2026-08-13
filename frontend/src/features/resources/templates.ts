import type { Kind } from './kinds'

/**
 * What a new object starts as. The head — `apiVersion`, `kind`, `metadata` — is
 * derived from the GVR and the scope the cluster serves, so every kind has one;
 * the body below is data per kind, the same way its columns are. A kind with no
 * entry gets the head alone, which is still a valid object to fill in.
 */
type Body = {
  name: string
  spec: string
}

const BODIES: Record<string, Body> = {
  namespaces: { name: 'my-namespace', spec: '' },

  pods: {
    name: 'my-pod',
    spec: `spec:
  containers:
    - name: app
      image: nginx:1.27
      ports:
        - containerPort: 80
      resources:
        requests:
          cpu: 50m
          memory: 64Mi`,
  },

  deployments: {
    name: 'my-app',
    spec: `spec:
  replicas: 1
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: app
          image: nginx:1.27
          ports:
            - containerPort: 80
          resources:
            requests:
              cpu: 50m
              memory: 64Mi`,
  },

  statefulsets: {
    name: 'my-app',
    spec: `spec:
  serviceName: my-app
  replicas: 1
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: app
          image: nginx:1.27
          volumeMounts:
            - name: data
              mountPath: /data
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: [ReadWriteOnce]
        resources:
          requests:
            storage: 1Gi`,
  },

  daemonsets: {
    name: 'my-agent',
    spec: `spec:
  selector:
    matchLabels:
      app: my-agent
  template:
    metadata:
      labels:
        app: my-agent
    spec:
      containers:
        - name: agent
          image: busybox:1.36
          command: ["sh", "-c", "sleep infinity"]`,
  },

  jobs: {
    name: 'my-job',
    spec: `spec:
  backoffLimit: 3
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: job
          image: busybox:1.36
          command: ["sh", "-c", "echo hello"]`,
  },

  cronjobs: {
    name: 'my-cronjob',
    spec: `spec:
  schedule: "*/5 * * * *"
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: job
              image: busybox:1.36
              command: ["sh", "-c", "echo hello"]`,
  },

  services: {
    name: 'my-app',
    spec: `spec:
  type: ClusterIP
  selector:
    app: my-app
  ports:
    - name: http
      port: 80
      targetPort: 80`,
  },

  ingresses: {
    name: 'my-app',
    spec: `spec:
  rules:
    - host: my-app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: my-app
                port:
                  number: 80`,
  },

  configmaps: {
    name: 'my-config',
    spec: `data:
  key: value`,
  },

  secrets: {
    name: 'my-secret',
    spec: `type: Opaque
stringData:
  key: value`,
  },

  pvc: {
    name: 'my-data',
    spec: `spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 1Gi`,
  },

  serviceaccounts: { name: 'my-account', spec: '' },

  hpa: {
    name: 'my-app',
    spec: `spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  minReplicas: 1
  maxReplicas: 5
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 80`,
  },
}

const apiVersion = (kind: Kind) =>
  kind.gvr.group ? `${kind.gvr.group}/${kind.gvr.version}` : kind.gvr.version

export function objectTemplate(kind: Kind, namespace: string): string {
  const body = BODIES[kind.id]

  const lines = [
    `apiVersion: ${apiVersion(kind)}`,
    `kind: ${kind.kind}`,
    'metadata:',
    `  name: ${body?.name ?? ''}`,
  ]
  if (kind.namespaced) lines.push(`  namespace: ${namespace || 'default'}`)
  if (body?.spec) lines.push(body.spec)

  return `${lines.join('\n')}\n`
}
