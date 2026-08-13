package domain

// Usage is one sample of what a node or a pod is consuming. CPU is millicores
// and memory is bytes: the API answers in quantities, and parsing them here is
// what keeps a quantity parser out of the frontend.
type Usage struct {
	Name        string `json:"name"`
	Namespace   string `json:"namespace,omitempty"`
	CPUMilli    int64  `json:"cpuMilli"`
	MemoryBytes int64  `json:"memoryBytes"`
}

// MetricsSample is one poll of metrics.k8s.io. A cluster without metrics-server
// is normal rather than broken, so Available carries that answer instead of the
// call failing — see decisions/metrics.md.
type MetricsSample struct {
	ClusterID string  `json:"clusterId"`
	Available bool    `json:"available"`
	Error     string  `json:"error,omitempty"`
	Nodes     []Usage `json:"nodes"`
	Pods      []Usage `json:"pods"`
}

// PodUsage is one poll of a single pod, kept per container. MetricsSample sums
// the containers because its readers are tables of pods; the detail drawer is
// the one reader that needs them apart, and asking for one pod is a request the
// cluster-wide list cannot be trimmed into.
type PodUsage struct {
	Name       string  `json:"name"`
	Namespace  string  `json:"namespace"`
	Available  bool    `json:"available"`
	Error      string  `json:"error,omitempty"`
	Timestamp  string  `json:"timestamp,omitempty"`
	Window     string  `json:"window,omitempty"`
	Containers []Usage `json:"containers"`
}
