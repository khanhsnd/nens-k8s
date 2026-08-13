# Packaging and updates

How a build becomes an installer, where the version comes from, and what the app does about a newer
release.

### wails.json is the only place a version is written

The exe's resource block, the NSIS installer and the app's own status bar all need the version, and
three copies would drift the first time one of them was forgotten. `wails.json`'s
`info.productVersion` is the source: Wails already reads it for the first two, and `main.go` embeds
`wails.json` to read it for the third. Embedding the build config is unusual, and the alternative is
worse — `-ldflags "-X main.version=…"` puts the truth in a build command that nothing verifies, and a
plain `wails build` would then ship a binary whose version says `dev` while its installer says
`0.1.0`.

The release workflow rewrites `info.productVersion` from the tag before building, so the tag is what
ends up everywhere. A tree built by hand keeps whatever the file says.

`SettingsAPI.Version()` hands that string to the frontend. The status bar shows `Nens <version>`, and
`dev` is what the browser preview and an unstamped build report.

### The installer renames nothing

`wails.json`'s `outputfilename` is `nens`, but NSIS's default `PRODUCT_EXECUTABLE` is
`${INFO_PROJECTNAME}.exe` — `nens-k8s.exe` — and `wails_tools.nsh` installs the binary *under that
name*. `project.nsi` defines `PRODUCT_EXECUTABLE "nens.exe"` so the installed program, the shortcut
and the WebView2 data folder all match the binary that was built. `InstallDir` drops the company
level for the same reason: `C:\Program Files\Nens\Nens` reads like a mistake.

Uninstalling removes the program and the WebView2 data folder, and deliberately leaves
`%AppData%/Nens` — settings, imported kubeconfigs and the log are the user's, not the installer's.

### Updates are a check, a checksum and someone else's installer

`internal/update.Feed` reads the repository's `releases/latest` from the GitHub API, compares the tag
with the running version, and — when asked — downloads `nens-<version>-windows-x64-setup.exe`,
verifying it against the `checksums.txt` published beside it before anything is executed. The
download is a temporary file that is removed unless the hash matches.

The comparison is three integers, not semver: a release is `vX.Y.Z` or it is not a release this app
will offer. Anything else — a `nightly` tag, a missing asset — is an error rather than a silent "no
update", because the two are different problems.

A build reporting `dev` never touches the network. A local tree offering to replace itself with a
published installer is a way to lose uncommitted work.

`UpdateAPI.Install` starts the installer through the shell rather than `exec.Command`: NSIS's
manifest asks for administrator, and `CreateProcess` refuses such a program outright instead of
prompting. Only `ShellExecute` with the `runas` verb raises the elevation prompt, and declining it
leaves Nens running. The app quits immediately after the installer starts, because NSIS cannot
replace a running exe.

Nothing polls. The check runs when the settings dialog opens and when the user presses Check — a
Kubernetes client that phones an external host on a schedule is a surprise nobody asked for.

### Nothing is signed

There is no code-signing certificate, so SmartScreen shows *"Windows protected your PC"* on a freshly
downloaded installer until the reader chooses **More info → Run anyway**. That is the absence of a
certificate, not a fault in the build. The separate UAC prompt is the installer asking for
administrator, which is what an installer is supposed to do.

Signing would be `signtool sign /fd sha256 /tr <timestamp server> /td sha256` over both `nens.exe`
and the installer, wired into `project.nsi`'s `!finalize`/`!uninstfinalize` hooks. An OV certificate
still starts with no reputation and may keep warning; an EV certificate is trusted immediately.

### Releasing

```powershell
git tag v0.2.0
git push origin v0.2.0
```

`.github/workflows/release.yml` builds on `windows-latest`, stamps the version, produces the NSIS
installer, writes `checksums.txt` and publishes both to the release for that tag. The repository is
public, so the app reads that feed unauthenticated and no token is involved.

Building an installer locally needs NSIS on PATH:

```powershell
wails build -platform windows/amd64 -nsis
```
