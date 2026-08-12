package exec

import (
	"context"
	"fmt"
	"time"

	"nens-k8s/internal/domain"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/wait"
	corev1client "k8s.io/client-go/kubernetes/typed/core/v1"
)

const (
	nodeShellNamespace = "kube-system"
	nodeShellContainer = "shell"
	nodeShellImage     = "docker.io/library/alpine:3.20"
	nodeShellTimeout   = 90 * time.Second
	nodeShellPoll      = 500 * time.Millisecond
	removeTimeout      = 15 * time.Second
)

// The container only has to exist and be privileged; the shell itself enters the
// host's namespaces through PID 1.
var (
	nodeShellIdle    = []string{"sleep", "infinity"}
	nodeShellCommand = []string{"nsenter", "--target", "1", "--mount", "--uts", "--ipc", "--net", "--pid", "--", "sh", "-l"}
)

// NodeShell runs a privileged pod on the node and attaches to it, so a node gets
// a terminal through the same exec path a container does. The pod is deleted
// when the session ends.
func (r *Runner) NodeShell(
	ctx context.Context,
	token string,
	clusterID string,
	node string,
	opts domain.ExecOptions,
) error {
	conn, ok := r.clusters.Connection(clusterID)
	if !ok {
		return fmt.Errorf("cluster %q is not connected", clusterID)
	}
	if node == "" {
		return fmt.Errorf("a node name is required")
	}

	client := conn.Clientset().CoreV1().Pods(nodeShellNamespace)
	pod, err := client.Create(ctx, nodeShellPod(node), metav1.CreateOptions{})
	if err != nil {
		return err
	}

	remove := func() {
		ctx, cancel := context.WithTimeout(context.Background(), removeTimeout)
		defer cancel()

		grace := int64(0)
		_ = client.Delete(ctx, pod.Name, metav1.DeleteOptions{GracePeriodSeconds: &grace})
	}

	if err := waitRunning(ctx, client, pod.Name); err != nil {
		remove()
		return err
	}

	if len(opts.Command) == 0 {
		opts.Command = nodeShellCommand
	}
	opts.TTY = true

	target := domain.ContainerTarget{
		Namespace: nodeShellNamespace,
		Pod:       pod.Name,
		Container: nodeShellContainer,
	}
	if err := r.start(token, conn, target, opts, remove); err != nil {
		remove()
		return err
	}
	return nil
}

func nodeShellPod(node string) *corev1.Pod {
	privileged := true

	return &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			GenerateName: "nens-node-shell-",
			Namespace:    nodeShellNamespace,
			Labels:       map[string]string{"app.kubernetes.io/managed-by": "nens"},
		},
		Spec: corev1.PodSpec{
			NodeName:      node,
			HostPID:       true,
			HostIPC:       true,
			HostNetwork:   true,
			RestartPolicy: corev1.RestartPolicyNever,
			Tolerations:   []corev1.Toleration{{Operator: corev1.TolerationOpExists}},
			Containers: []corev1.Container{{
				Name:            nodeShellContainer,
				Image:           nodeShellImage,
				Command:         nodeShellIdle,
				SecurityContext: &corev1.SecurityContext{Privileged: &privileged},
			}},
		},
	}
}

func waitRunning(ctx context.Context, client corev1client.PodInterface, name string) error {
	return wait.PollUntilContextTimeout(ctx, nodeShellPoll, nodeShellTimeout, true,
		func(ctx context.Context) (bool, error) {
			pod, err := client.Get(ctx, name, metav1.GetOptions{})
			if err != nil {
				return false, err
			}

			switch pod.Status.Phase {
			case corev1.PodRunning:
				return true, nil
			case corev1.PodFailed, corev1.PodSucceeded:
				return false, fmt.Errorf("node shell pod %s is %s", name, pod.Status.Phase)
			default:
				return false, nil
			}
		})
}
