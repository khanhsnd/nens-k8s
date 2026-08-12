package kubeconfig

import (
	"cmp"
	"sort"
	"strings"

	"nens-k8s/internal/domain"

	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

const (
	defaultQPS   = 50
	defaultBurst = 100
)

type Loader struct {
	settings domain.SettingsStore
}

func NewLoader(settings domain.SettingsStore) *Loader {
	return &Loader{settings: settings}
}

func (l *Loader) rules() *clientcmd.ClientConfigLoadingRules {
	rules := clientcmd.NewDefaultClientConfigLoadingRules()
	rules.Precedence = append(rules.Precedence, l.settings.Kubeconfigs()...)
	return rules
}

func (l *Loader) Clusters() ([]domain.Cluster, error) {
	cfg, err := l.rules().Load()
	if err != nil {
		return nil, err
	}

	aliases := l.settings.ClusterNames()
	clusters := make([]domain.Cluster, 0, len(cfg.Contexts))
	for name, kctx := range cfg.Contexts {
		cluster := domain.Cluster{
			ID:        name,
			Name:      cmp.Or(aliases[name], name),
			Context:   name,
			User:      kctx.AuthInfo,
			Namespace: kctx.Namespace,
			Phase:     domain.PhaseDisconnected,
		}
		if cluster.Namespace == "" {
			cluster.Namespace = "default"
		}
		if entry, ok := cfg.Clusters[kctx.Cluster]; ok {
			cluster.Server = entry.Server
		}
		clusters = append(clusters, cluster)
	}

	sort.Slice(clusters, func(i, j int) bool { return clusters[i].Name < clusters[j].Name })
	return clusters, nil
}

func (l *Loader) Rename(id string, name string) error {
	return l.settings.SetClusterName(id, strings.TrimSpace(name))
}

func (l *Loader) RESTConfig(contextName string) (*rest.Config, error) {
	cfg, err := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		l.rules(),
		&clientcmd.ConfigOverrides{CurrentContext: contextName},
	).ClientConfig()
	if err != nil {
		return nil, err
	}

	cfg.QPS = defaultQPS
	cfg.Burst = defaultBurst
	cfg.UserAgent = "nens-k8s"
	return cfg, nil
}
