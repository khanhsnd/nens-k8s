package domain

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
