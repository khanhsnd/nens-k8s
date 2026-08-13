package helm

import (
	"nens-k8s/internal/kube/cluster"

	apimeta "k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

// getter is how helm asks for clients. It answers with the ones the connection
// already dialled — same REST config, same cached discovery, same mapper — so a
// release is read over the connection the rest of the app uses and dies with it.
//
// It is also its own clientcmd.ClientConfig: the only thing helm reads off that
// loader is the namespace, which the caller already knows, so there is no
// kubeconfig to find and parse a second time.
type getter struct {
	conn      *cluster.Connection
	namespace string
}

func (g getter) ToRESTConfig() (*rest.Config, error) { return g.conn.RESTConfig(), nil }

func (g getter) ToDiscoveryClient() (discovery.CachedDiscoveryInterface, error) {
	return g.conn.Discovery(), nil
}

func (g getter) ToRESTMapper() (apimeta.RESTMapper, error) { return g.conn.Mapper(), nil }

func (g getter) ToRawKubeConfigLoader() clientcmd.ClientConfig { return g }

func (g getter) RawConfig() (clientcmdapi.Config, error) { return clientcmdapi.Config{}, nil }

func (g getter) ClientConfig() (*rest.Config, error) { return g.conn.RESTConfig(), nil }

func (g getter) Namespace() (string, bool, error) { return g.namespace, false, nil }

func (g getter) ConfigAccess() clientcmd.ConfigAccess { return clientcmd.NewDefaultPathOptions() }
