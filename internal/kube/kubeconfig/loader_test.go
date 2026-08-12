package kubeconfig

import "testing"

func clusterNamed(t *testing.T, loader *Loader, id string) string {
	t.Helper()

	clusters, err := loader.Clusters()
	if err != nil {
		t.Fatal(err)
	}
	for _, cluster := range clusters {
		if cluster.ID == id {
			if cluster.Context != id {
				t.Errorf("context = %q, want %q", cluster.Context, id)
			}
			return cluster.Name
		}
	}

	t.Fatalf("context %q missing from %+v", id, clusters)
	return ""
}

func TestRenameAliasesTheContextName(t *testing.T) {
	loader, _ := newLoader(t)

	if _, err := loader.Import(sample); err != nil {
		t.Fatal(err)
	}
	if name := clusterNamed(t, loader, "Paste Me"); name != "Paste Me" {
		t.Fatalf("name = %q, want the context name", name)
	}

	if err := loader.Rename("Paste Me", "  Production  "); err != nil {
		t.Fatal(err)
	}
	if name := clusterNamed(t, loader, "Paste Me"); name != "Production" {
		t.Errorf("name = %q, want Production", name)
	}

	if err := loader.Rename("Paste Me", "   "); err != nil {
		t.Fatal(err)
	}
	if name := clusterNamed(t, loader, "Paste Me"); name != "Paste Me" {
		t.Errorf("name = %q, want the context name back", name)
	}
}
