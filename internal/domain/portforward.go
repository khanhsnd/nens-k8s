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

// ForwardSpec is what a forward needs to be started again after a restart.
type ForwardSpec struct {
	Ref        ResourceRef `json:"ref"`
	LocalPort  int         `json:"localPort"`
	RemotePort int         `json:"remotePort"`
}

func (s ForwardSpec) SameTunnel(other ForwardSpec) bool {
	return s.Ref.ClusterID == other.Ref.ClusterID &&
		s.Ref.GVR == other.Ref.GVR &&
		s.Ref.Namespace == other.Ref.Namespace &&
		s.Ref.Name == other.Ref.Name &&
		s.RemotePort == other.RemotePort
}
