package domain

const (
	ForwardStarting = "starting"
	ForwardActive   = "active"
	ForwardError    = "error"
	ForwardStopped  = "stopped"
)

type ForwardPort struct {
	Name     string `json:"name"`
	Port     int    `json:"port"`
	Protocol string `json:"protocol"`
}

type PortForward struct {
	ID         string `json:"id"`
	ClusterID  string `json:"clusterId"`
	Namespace  string `json:"namespace"`
	Resource   string `json:"resource"`
	Name       string `json:"name"`
	Pod        string `json:"pod"`
	LocalPort  int    `json:"localPort"`
	RemotePort int    `json:"remotePort"`
	Status     string `json:"status"`
	Error      string `json:"error,omitempty"`
}
