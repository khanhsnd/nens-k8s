package domain

type GVR struct {
	Group    string `json:"group"`
	Version  string `json:"version"`
	Resource string `json:"resource"`
}

type ResourceRef struct {
	ClusterID string `json:"clusterId"`
	GVR       GVR    `json:"gvr"`
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
	UID       string `json:"uid"`
}

type EventType string

const (
	EventAdded    EventType = "added"
	EventModified EventType = "modified"
	EventDeleted  EventType = "deleted"
)

type ResourceEvent struct {
	Type   EventType      `json:"type"`
	UID    string         `json:"uid"`
	Object map[string]any `json:"object,omitempty"`
}

type ResourceBatch struct {
	Token  string          `json:"token"`
	Reset  bool            `json:"reset"`
	Synced bool            `json:"synced"`
	Error  string          `json:"error,omitempty"`
	Events []ResourceEvent `json:"events"`
}

type Subscription struct {
	Token     string `json:"token"`
	ClusterID string `json:"clusterId"`
	GVR       GVR    `json:"gvr"`
	Namespace string `json:"namespace"`
}

type OwnerRef struct {
	GVR       GVR    `json:"gvr"`
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	UID       string `json:"uid"`
}

type EventRecord struct {
	Type    string `json:"type"`
	Reason  string `json:"reason"`
	Message string `json:"message"`
	Source  string `json:"source"`
	Count   int64  `json:"count"`
	Last    string `json:"last"`
}

type APIResource struct {
	GVR        GVR      `json:"gvr"`
	Kind       string   `json:"kind"`
	Namespaced bool     `json:"namespaced"`
	Verbs      []string `json:"verbs"`
}
