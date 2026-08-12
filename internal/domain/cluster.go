package domain

type ClusterPhase string

const (
	PhaseDisconnected ClusterPhase = "disconnected"
	PhaseConnecting   ClusterPhase = "connecting"
	PhaseConnected    ClusterPhase = "connected"
	PhaseError        ClusterPhase = "error"
)

type Cluster struct {
	ID        string       `json:"id"`
	Name      string       `json:"name"`
	Context   string       `json:"context"`
	Server    string       `json:"server"`
	User      string       `json:"user"`
	Namespace string       `json:"namespace"`
	Phase     ClusterPhase `json:"phase"`
	Version   string       `json:"version"`
	Error     string       `json:"error"`
}
