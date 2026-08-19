package update

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"runtime"
	"strings"
	"testing"
)

const installer = "nens installer bytes"

type published struct {
	tag    string
	assets map[string]string
	hidden bool
}

func feed(t *testing.T, version string, release published) *Feed {
	t.Helper()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if name, ok := strings.CutPrefix(r.URL.Path, "/download/"); ok {
			_, _ = w.Write([]byte(release.assets[name]))
			return
		}

		body := map[string]any{"tag_name": release.tag, "html_url": "https://example.test/release"}
		assets := make([]map[string]string, 0, len(release.assets))
		for name := range release.assets {
			assets = append(assets, map[string]string{
				"name":                 name,
				"browser_download_url": "http://" + r.Host + "/download/" + name,
			})
		}
		if !release.hidden {
			body["assets"] = assets
		}
		_ = json.NewEncoder(w).Encode(body)
	}))
	t.Cleanup(server.Close)

	source := NewFeed(version)
	source.url = server.URL + "/releases/latest"
	return source
}

func checksums(t *testing.T, version string, body string) string {
	t.Helper()

	sum := sha256.Sum256([]byte(body))
	return hex.EncodeToString(sum[:]) + "  " + assetName(version)
}

func publish(t *testing.T, version string) published {
	t.Helper()

	return published{
		tag: "v" + version,
		assets: map[string]string{
			assetName(version): installer,
			checksumsName:      checksums(t, version, installer),
		},
	}
}

func TestStatusSeesANewerRelease(t *testing.T) {
	status, err := feed(t, "0.1.0", publish(t, "0.2.0")).Status(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	if !status.Available || status.Latest != "0.2.0" || status.Current != "0.1.0" {
		t.Fatalf("status = %+v", status)
	}
	if status.Page != "https://example.test/release" {
		t.Errorf("page = %q", status.Page)
	}
}

func TestStatusOnTheLatestRelease(t *testing.T) {
	status, err := feed(t, "0.2.0", publish(t, "0.2.0")).Status(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	if status.Available {
		t.Errorf("status = %+v, want nothing on offer", status)
	}
}

func TestADevelopmentBuildNeverAsksTheNetwork(t *testing.T) {
	source := NewFeed(development)
	source.url = "http://127.0.0.1:0/never"

	status, err := source.Status(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !status.Development || status.Available {
		t.Errorf("status = %+v, want a development build", status)
	}

	if _, err := source.Download(context.Background()); err == nil {
		t.Error("a development build should refuse to install a release over itself")
	}
}

func TestStatusRejectsAReleaseItCannotUse(t *testing.T) {
	tests := map[string]published{
		"tag is not a version": {tag: "nightly", assets: publish(t, "0.2.0").assets},
		"no installer":         {tag: "v0.2.0", assets: map[string]string{checksumsName: "whatever"}},
		"no checksums":         {tag: "v0.2.0", hidden: true},
	}

	for name, broken := range tests {
		t.Run(name, func(t *testing.T) {
			if _, err := feed(t, "0.1.0", broken).Status(context.Background()); err == nil {
				t.Error("Status should have failed")
			}
		})
	}
}

func TestOnlyTheWindowsBuildInstallsItself(t *testing.T) {
	source := feed(t, "0.1.0", publish(t, "0.2.0"))

	status, err := source.Status(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !status.Available {
		t.Fatalf("status = %+v, want the newer release", status)
	}
	if status.CanInstall != selfInstalling {
		t.Errorf("canInstall = %t on %s", status.CanInstall, runtime.GOOS)
	}

	if !selfInstalling {
		if _, err := source.Download(context.Background()); err == nil {
			t.Error("Download should refuse on a platform Nens cannot replace in place")
		}
	}
}

func TestDownloadKeepsWhatMatchesTheChecksum(t *testing.T) {
	if !selfInstalling {
		t.Skip("only the Windows build downloads an installer")
	}

	path, err := feed(t, "0.1.0", publish(t, "0.2.0")).Download(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Remove(path) })

	saved, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(saved) != installer {
		t.Errorf("installer = %q, want the published bytes", saved)
	}
}

func TestDownloadRefusesWhatDoesNotMatchTheChecksum(t *testing.T) {
	if !selfInstalling {
		t.Skip("only the Windows build downloads an installer")
	}

	tampered := publish(t, "0.2.0")
	tampered.assets[assetName("0.2.0")] = "something else entirely"

	path, err := feed(t, "0.1.0", tampered).Download(context.Background())
	if err == nil {
		_ = os.Remove(path)
		t.Fatal("a mismatched installer should be refused")
	}
	if path != "" {
		t.Errorf("path = %q, want nothing left behind", path)
	}
}

func TestDownloadRefusesWhenThereIsNothingNewer(t *testing.T) {
	if !selfInstalling {
		t.Skip("only the Windows build downloads an installer")
	}

	if _, err := feed(t, "0.2.0", publish(t, "0.2.0")).Download(context.Background()); err == nil {
		t.Error("Download should refuse to reinstall the running version")
	}
}

func TestIsNewer(t *testing.T) {
	tests := []struct {
		current string
		latest  string
		want    bool
	}{
		{current: "0.1.0", latest: "0.1.1", want: true},
		{current: "0.1.0", latest: "0.2.0", want: true},
		{current: "0.9.0", latest: "1.0.0", want: true},
		{current: "1.0.0", latest: "1.0.0"},
		{current: "1.2.0", latest: "1.1.9"},
		{current: "2.0.0", latest: "10.0.0", want: true},
	}

	for _, test := range tests {
		got, err := isNewer(test.current, test.latest)
		if err != nil {
			t.Fatalf("isNewer(%q, %q): %v", test.current, test.latest, err)
		}
		if got != test.want {
			t.Errorf("isNewer(%q, %q) = %t, want %t", test.current, test.latest, got, test.want)
		}
	}

	if _, err := isNewer("dev", "1.0.0"); err == nil {
		t.Error("a version that cannot be parsed should be an error, not a false")
	}
}

// A client timeout counts the body, so a 30s one cuts an installer of tens of
// megabytes off part-way through and reports a context deadline instead. The
// deadline belongs on each call's context, never on the client.
func TestTheClientDoesNotCapTheWholeExchange(t *testing.T) {
	if timeout := NewFeed("0.1.0").client.Timeout; timeout != 0 {
		t.Errorf("client timeout = %s, want the body left uncapped", timeout)
	}
}
