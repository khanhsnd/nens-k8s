package domain

type KubeconfigFile struct {
	Path      string `json:"path"`
	Contexts  int    `json:"contexts"`
	Removable bool   `json:"removable"`
	Error     string `json:"error"`
}
