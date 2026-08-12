package domain

// APIResource is one entry of a cluster's served API surface. Custom marks a
// resource that is not part of the built-in Kubernetes groups — a CRD or an
// aggregated API — which is what the frontend groups under Custom Resources.
type APIResource struct {
	GVR        GVR             `json:"gvr"`
	Kind       string          `json:"kind"`
	Namespaced bool            `json:"namespaced"`
	Custom     bool            `json:"custom"`
	Verbs      []string        `json:"verbs"`
	ShortNames []string        `json:"shortNames,omitempty"`
	Columns    []PrinterColumn `json:"columns,omitempty"`
}

// PrinterColumn is one `additionalPrinterColumns` entry of a CRD. Priority > 0
// is kubectl's "wide" tier — the column exists but ships hidden.
type PrinterColumn struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	JSONPath    string `json:"jsonPath"`
	Priority    int32  `json:"priority"`
	Description string `json:"description,omitempty"`
}
