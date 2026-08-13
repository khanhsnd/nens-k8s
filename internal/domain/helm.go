package domain

// HelmRef names a release. Helm's identity is (namespace, name) inside one
// cluster — a release has no UID and no GVR, which is why it is not a Kind.
type HelmRef struct {
	ClusterID string `json:"clusterId"`
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
}

// HelmRelease is one revision of a release: the newest one in a list, an older
// one in a history. Both are the same row, so both are this struct.
type HelmRelease struct {
	ClusterID    string `json:"clusterId"`
	Namespace    string `json:"namespace"`
	Name         string `json:"name"`
	Revision     int    `json:"revision"`
	Status       string `json:"status"`
	Chart        string `json:"chart"`
	ChartVersion string `json:"chartVersion"`
	AppVersion   string `json:"appVersion"`
	Updated      string `json:"updated"`
	Description  string `json:"description,omitempty"`
}

// HelmDetail is one revision opened: what it was given (Values), what that
// rendered into (Manifest) and what it printed afterwards (Notes). Comparing
// two revisions is two of these — see decisions/helm.md.
type HelmDetail struct {
	Release  HelmRelease `json:"release"`
	Values   string      `json:"values"`
	Manifest string      `json:"manifest"`
	Notes    string      `json:"notes,omitempty"`
}
