package domain

type ExecOptions struct {
	Command []string `json:"command"`
	TTY     bool     `json:"tty"`
	Cols    uint16   `json:"cols"`
	Rows    uint16   `json:"rows"`
}

// ExecChunk carries base64: a terminal writes arbitrary bytes, and a multi-byte
// rune can straddle two reads.
type ExecChunk struct {
	Token string `json:"token"`
	Data  string `json:"data"`
	Done  bool   `json:"done"`
	Error string `json:"error,omitempty"`
}
