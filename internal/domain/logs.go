package domain

const (
	ContainerRoleInit      = "init"
	ContainerRoleApp       = "app"
	ContainerRoleEphemeral = "ephemeral"
)

type LogTarget struct {
	Namespace string `json:"namespace"`
	Pod       string `json:"pod"`
	Container string `json:"container"`
	Role      string `json:"role"`
	State     string `json:"state"`
	Restarts  int64  `json:"restarts"`
}

type LogOptions struct {
	Follow       bool  `json:"follow"`
	TailLines    int64 `json:"tailLines"`
	SinceSeconds int64 `json:"sinceSeconds"`
	Timestamps   bool  `json:"timestamps"`
	Previous     bool  `json:"previous"`
}

type LogChunk struct {
	Token   string   `json:"token"`
	Lines   []string `json:"lines"`
	Dropped int      `json:"dropped"`
	Done    bool     `json:"done"`
	Error   string   `json:"error,omitempty"`
}
