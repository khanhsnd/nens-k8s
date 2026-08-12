package forward

import (
	"context"
	"fmt"

	"nens-k8s/internal/domain"
	"nens-k8s/internal/kube/pods"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

// Ports is what the forward dialog offers: the numbers that exist on the pod
// side, so a service's named targetPort falls back to its own port.
func (r *Registry) Ports(ctx context.Context, ref domain.ResourceRef) ([]domain.ForwardPort, error) {
	conn, ok := r.clusters.Connection(ref.ClusterID)
	if !ok {
		return nil, fmt.Errorf("cluster %q is not connected", ref.ClusterID)
	}

	object, err := pods.Get(ctx, conn, ref)
	if err != nil {
		return nil, err
	}

	if ref.GVR.Group == "" && ref.GVR.Resource == "services" {
		return servicePorts(object), nil
	}
	return containerPorts(object), nil
}

func servicePorts(object *unstructured.Unstructured) []domain.ForwardPort {
	entries, _, _ := unstructured.NestedSlice(object.Object, "spec", "ports")
	ports := make([]domain.ForwardPort, 0, len(entries))

	for _, item := range entries {
		entry, _ := item.(map[string]any)
		number, found, _ := unstructured.NestedInt64(entry, "port")
		if !found {
			continue
		}
		if target, ok, _ := unstructured.NestedInt64(entry, "targetPort"); ok {
			number = target
		}

		name, _, _ := unstructured.NestedString(entry, "name")
		protocol, _, _ := unstructured.NestedString(entry, "protocol")
		ports = append(ports, domain.ForwardPort{Name: name, Port: int(number), Protocol: protocol})
	}
	return ports
}

func containerPorts(object *unstructured.Unstructured) []domain.ForwardPort {
	containers, found, _ := unstructured.NestedSlice(object.Object, "spec", "template", "spec", "containers")
	if !found {
		containers, _, _ = unstructured.NestedSlice(object.Object, "spec", "containers")
	}

	ports := make([]domain.ForwardPort, 0, 4)
	for _, item := range containers {
		container, _ := item.(map[string]any)
		owner, _ := container["name"].(string)

		entries, _, _ := unstructured.NestedSlice(container, "ports")
		for _, entry := range entries {
			port, _ := entry.(map[string]any)
			number, found, _ := unstructured.NestedInt64(port, "containerPort")
			if !found {
				continue
			}

			name, _, _ := unstructured.NestedString(port, "name")
			if name == "" {
				name = owner
			}
			protocol, _, _ := unstructured.NestedString(port, "protocol")
			ports = append(ports, domain.ForwardPort{Name: name, Port: int(number), Protocol: protocol})
		}
	}
	return ports
}
