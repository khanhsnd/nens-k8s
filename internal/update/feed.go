package update

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"runtime"
	"strings"
	"time"

	"nens-k8s/internal/domain"
)

const (
	releasesURL   = "https://api.github.com/repos/khanhsnd/nens-k8s/releases/latest"
	checksumsName = "checksums.txt"
	development   = "dev"
	requestLimit  = 30 * time.Second
	downloadLimit = 30 * time.Minute
	connectLimit  = 15 * time.Second
	checksumLimit = 1 << 20
)

var errDevelopment = errors.New("a development build does not update itself")

type Feed struct {
	client  *http.Client
	url     string
	version string
}

func NewFeed(version string) *Feed {
	return &Feed{
		client:  &http.Client{Transport: transport()},
		url:     releasesURL,
		version: version,
	}
}

func (f *Feed) Status(ctx context.Context) (domain.UpdateStatus, error) {
	status := domain.UpdateStatus{Current: f.version}
	if f.version == development {
		status.Development = true
		return status, nil
	}

	latest, err := f.latest(ctx)
	if err != nil {
		return domain.UpdateStatus{}, err
	}
	newer, err := isNewer(f.version, latest.version)
	if err != nil {
		return domain.UpdateStatus{}, err
	}

	slog.Info("checked for updates", "current", f.version, "latest", latest.version, "available", newer)
	status.Latest = latest.version
	status.Available = newer
	status.CanInstall = newer && selfInstalling
	status.Page = latest.page
	return status, nil
}

func (f *Feed) Download(ctx context.Context) (string, error) {
	if f.version == development {
		return "", errDevelopment
	}
	if !selfInstalling {
		return "", fmt.Errorf("a %s build is replaced from the release page, not from inside the app", runtime.GOOS)
	}

	latest, err := f.latest(ctx)
	if err != nil {
		return "", err
	}
	newer, err := isNewer(f.version, latest.version)
	if err != nil {
		return "", err
	}
	if !newer {
		return "", fmt.Errorf("%s is already the latest release", f.version)
	}

	path, err := f.save(ctx, latest)
	if err != nil {
		slog.Error("update download failed", "version", latest.version, "error", err)
		return "", err
	}

	slog.Info("update downloaded", "version", latest.version, "path", path)
	return path, nil
}

func (f *Feed) latest(ctx context.Context) (release, error) {
	ctx, cancel := context.WithTimeout(ctx, requestLimit)
	defer cancel()

	response, err := f.get(ctx, f.url, "application/vnd.github+json")
	if err != nil {
		return release{}, fmt.Errorf("read the latest release: %w", err)
	}
	defer response.Body.Close()

	var published struct {
		TagName string `json:"tag_name"`
		HTMLURL string `json:"html_url"`
		Assets  []struct {
			Name string `json:"name"`
			URL  string `json:"browser_download_url"`
		} `json:"assets"`
	}
	if err := json.NewDecoder(response.Body).Decode(&published); err != nil {
		return release{}, fmt.Errorf("read the latest release: %w", err)
	}

	version := strings.TrimPrefix(published.TagName, "v")
	if _, ok := parse(version); !ok {
		return release{}, fmt.Errorf("the latest release is tagged %q, which is not a version", published.TagName)
	}

	found := release{version: version, page: published.HTMLURL}
	for _, asset := range published.Assets {
		switch asset.Name {
		case assetName(version):
			found.installer = asset.URL
		case checksumsName:
			found.checksums = asset.URL
		}
	}
	if found.installer == "" || found.checksums == "" {
		return release{}, fmt.Errorf("release %s has no %s beside its %s", version, checksumsName, assetName(version))
	}
	return found, nil
}

func (f *Feed) save(ctx context.Context, latest release) (string, error) {
	want, err := f.checksum(ctx, latest)
	if err != nil {
		return "", err
	}

	ctx, cancel := context.WithTimeout(ctx, downloadLimit)
	defer cancel()

	response, err := f.get(ctx, latest.installer, "")
	if err != nil {
		return "", fmt.Errorf("download the installer: %w", err)
	}
	defer response.Body.Close()

	file, err := os.CreateTemp("", "nens-*-setup.exe")
	if err != nil {
		return "", err
	}
	path := file.Name()

	sum := sha256.New()
	_, err = io.Copy(io.MultiWriter(file, sum), response.Body)
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		_ = os.Remove(path)
		return "", fmt.Errorf("download the installer: %w", err)
	}
	if !strings.EqualFold(hex.EncodeToString(sum.Sum(nil)), want) {
		_ = os.Remove(path)
		return "", errors.New("the downloaded installer does not match the published checksum")
	}
	return path, nil
}

func (f *Feed) checksum(ctx context.Context, latest release) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, requestLimit)
	defer cancel()

	response, err := f.get(ctx, latest.checksums, "")
	if err != nil {
		return "", fmt.Errorf("download %s: %w", checksumsName, err)
	}
	defer response.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(response.Body, checksumLimit))
	if err != nil {
		return "", err
	}

	name := assetName(latest.version)
	for line := range strings.SplitSeq(string(raw), "\n") {
		fields := strings.Fields(line)
		if len(fields) == 2 && strings.TrimPrefix(fields[1], "*") == name && len(fields[0]) == hex.EncodedLen(sha256.Size) {
			return fields[0], nil
		}
	}
	return "", fmt.Errorf("%s does not cover %s", checksumsName, name)
}

func (f *Feed) get(ctx context.Context, url string, accept string) (*http.Response, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	if accept != "" {
		request.Header.Set("Accept", accept)
	}

	response, err := f.client.Do(request)
	if err != nil {
		return nil, err
	}
	if response.StatusCode != http.StatusOK {
		response.Body.Close()
		return nil, errors.New(response.Status)
	}
	return response, nil
}

// Nothing caps the whole exchange: an http.Client.Timeout counts the body too, so
// a 30s one fires part-way through an installer of tens of megabytes and reports a
// context deadline instead of a download. What is capped here is the part that can
// hang without transferring anything — the connection and the wait for headers —
// and each call gives its own body the deadline that body deserves.
func transport() *http.Transport {
	carrier := http.DefaultTransport.(*http.Transport).Clone()
	carrier.DialContext = (&net.Dialer{Timeout: connectLimit}).DialContext
	carrier.TLSHandshakeTimeout = connectLimit
	carrier.ResponseHeaderTimeout = requestLimit
	return carrier
}

type release struct {
	version   string
	page      string
	installer string
	checksums string
}

// Only the Windows build replaces itself: it ships an NSIS installer that owns
// the running exe. A macOS app bundle and a Linux archive were put wherever
// their reader chose, so the release page is the honest answer there.
const selfInstalling = runtime.GOOS == "windows"

func assetName(version string) string {
	switch runtime.GOOS {
	case "windows":
		return "nens-" + version + "-windows-x64-setup.exe"
	case "darwin":
		return "nens-" + version + "-macos-universal.zip"
	default:
		return "nens-" + version + "-linux-x64.tar.gz"
	}
}

func isNewer(current string, latest string) (bool, error) {
	running, ok := parse(current)
	if !ok {
		return false, fmt.Errorf("this build reports version %q, which cannot be compared", current)
	}
	published, ok := parse(latest)
	if !ok {
		return false, fmt.Errorf("the latest release reports version %q, which cannot be compared", latest)
	}

	for i := range running {
		if published[i] != running[i] {
			return published[i] > running[i], nil
		}
	}
	return false, nil
}

func parse(version string) ([3]int, bool) {
	var parsed [3]int

	parts := strings.Split(version, ".")
	if len(parts) != len(parsed) {
		return parsed, false
	}
	for i, part := range parts {
		if part == "" {
			return parsed, false
		}
		for _, digit := range part {
			if digit < '0' || digit > '9' {
				return parsed, false
			}
			parsed[i] = parsed[i]*10 + int(digit-'0')
		}
	}
	return parsed, true
}
