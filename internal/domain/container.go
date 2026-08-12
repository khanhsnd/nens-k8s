package domain

const (
	ContainerRoleInit      = "init"
	ContainerRoleApp       = "app"
	ContainerRoleEphemeral = "ephemeral"
)

// ContainerTarget is one container of one pod: what logs stream from and what a
// shell attaches to.
type ContainerTarget struct {
	Namespace string `json:"namespace"`
	Pod       string `json:"pod"`
	Container string `json:"container"`
	Role      string `json:"role"`
	State     string `json:"state"`
	Restarts  int64  `json:"restarts"`
}
