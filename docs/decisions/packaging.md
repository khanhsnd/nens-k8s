# Packaging and updates

How a build becomes a download, where the version comes from, and what the app does about a newer
release.

### Three platforms, one release, one thing that installs itself

| Platform | Asset | What Settings → Updates does |
| --- | --- | --- |
| Windows 10/11 x64 | `nens-<version>-windows-x64-setup.exe` | downloads it, checks the hash, runs it, quits |
| macOS 12+ universal | `nens-<version>-macos-universal.zip` | opens the release page |
| Linux x64 | `nens-<version>-linux-x64.tar.gz` | opens the release page |

Only Windows replaces itself, and that is a property of what is shipped rather than a missing
feature: NSIS is a program whose job is to overwrite the exe that started it. A macOS `.app` and a
Linux archive were unpacked wherever their reader chose — dragging the bundle to `/Applications`,
untarring over `~/.local/opt`, or something else entirely — and an app that guesses where its own
copy lives and overwrites it is an app that will one day overwrite the wrong thing.

`update.Feed` therefore derives everything from `runtime.GOOS`: the asset name it looks for, and
`selfInstalling`, which becomes `UpdateStatus.CanInstall`. The frontend shows **Install and restart**
only when that is true, and makes **Release notes** the primary button otherwise — so the same
section is honest on all three without a platform check in the view.

The Linux build links against WebKit2GTK **4.0**, Wails' default, built on `ubuntu-22.04` — the last
runner image that carries `libwebkit2gtk-4.0-dev`. A distribution that ships only 4.1 (Ubuntu 24.04
and later) needs `wails build -tags webkit2_41` against `libwebkit2gtk-4.1-dev` instead, which is a
second asset nobody has asked for yet.

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

Each build command also carries `-ldflags "-X main.version=$version"`, which does nothing here:
`main.go` has a `version()` function reading the embedded config, not a `main.version` variable, and
the linker drops an `-X` for a symbol that does not exist without complaining. It is kept so the
three release workflows in this family read alike; the stamping step above it is what actually sets
the version. Should a `var version string` ever appear in `main.go`, it would silently become a
second source of truth — delete the flag rather than the stamping step.

`SettingsAPI.Version()` hands that string to the frontend. The status bar shows `Nens <version>`, and
`dev` is what the browser preview and an unstamped build report.

### `name` and `outputfilename` are the same word

Both are `nens`, and they have to agree, because two platforms name things after `name` rather than
after the binary Wails actually built:

- macOS — `packageApplicationForDarwin` calls the bundle `<name>.app` and puts the `outputfilename`
  binary inside it. When they differed, the release workflow built `nens-k8s.app` and then `ditto`
  failed on the `nens.app` it was told to zip.
- Windows — NSIS's `PRODUCT_EXECUTABLE` defaults to `${INFO_PROJECTNAME}.exe`, which
  `wails_tools.nsh` fills in from `name`, and `wails.files` installs the built binary *under that
  name*. When they differed, the installed program, the shortcut and the WebView2 data folder all
  carried a name the exe did not have.

So neither `project.nsi` nor the workflow overrides anything — keeping one word removes both
problems at the source. `InstallDir` does drop the company level, for its own reason:
`C:\Program Files\Nens\Nens` reads like a mistake.

Uninstalling removes the program and the WebView2 data folder, and deliberately leaves
`%AppData%/Nens` — settings, imported kubeconfigs and the log are the user's, not the installer's.

### Updates are a check, a checksum and someone else's installer

`internal/update.Feed` reads the repository's `releases/latest` from the GitHub API, compares the tag
with the running version, and — when asked, and only on Windows — downloads this platform's asset,
verifying it against the `checksums.txt` published beside it before anything is executed. The
download is a temporary file that is removed unless the hash matches. One `checksums.txt` covers all
three assets, and each platform reads its own line out of it.

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

### Nothing is signed or notarized

There is no code-signing certificate and no Apple Developer account, which shows up differently on
each platform:

- **Windows** — SmartScreen shows *"Windows protected your PC"* on a freshly downloaded installer
  until the reader chooses **More info → Run anyway**. Signing would be
  `signtool sign /fd sha256 /tr <timestamp server> /td sha256` over both `nens.exe` and the
  installer, wired into `project.nsi`'s `!finalize`/`!uninstfinalize` hooks. An OV certificate still
  starts with no reputation and may keep warning; an EV certificate is trusted immediately.
- **macOS** — the unzipped bundle carries the quarantine attribute and Gatekeeper refuses it, so the
  first run needs `xattr -dr com.apple.quarantine nens.app`. Removing that step needs a Developer ID
  signature *and* notarization, not just one of the two.
- **Linux** — nothing signs desktop archives, so there is nothing to fix.

The separate UAC prompt on Windows is the installer asking for administrator, which is what an
installer is supposed to do.

### Releasing

```powershell
git tag v0.2.0
git push origin v0.2.0
```

`.github/workflows/release.yml` stamps `wails.json` from the tag on `windows-latest`, `macos-14` and
`ubuntu-22.04`, builds that platform's asset, and a fourth job collects all three, writes one
`checksums.txt` over them and publishes the release. The repository is public, so the app reads that
feed unauthenticated and no token is involved — the default `GITHUB_TOKEN` with `contents: write` is
all the workflow needs.

The release does not run `go test`: a tag is pushed at a commit whose tests were already run, and a
test job that only ever passes is a job that only ever costs minutes. Run them before tagging.

The Windows job installs NSIS with `choco install nsis`, then finds `makensis.exe` under either
Program Files directory and appends its folder to `GITHUB_PATH` — Chocolatey does not put it there
itself. A separate step resolves `makensis.exe` and runs `/VERSION`, so a broken install fails on its
own step instead of inside `wails build`.

Downloading the NSIS zip from SourceForge was tried instead, after a Chocolatey 504 failed a release
that had nothing wrong with it. It is worse: `downloads.sourceforge.net` answers with a mirror
interstitial rather than the archive, and `Expand-Archive` then dies on an HTML file with an empty
`OperationStopped` message that says nothing about what happened. Chocolatey fails loudly and rarely;
the mirror fails silently and often. Retrying the release is the answer to a 504.

### The Homebrew Cask is written by the release, not maintained by hand

A fifth job rewrites `Casks/nens.rb` in `khanhsnd/homebrew-tap` from the macOS artifact it just
published, because the Cask carries the one field a human always gets wrong: the `sha256` of a zip
that only exists after the build. It reads the hash from the downloaded artifact rather than from
`checksums.txt`, so the Cask and the asset cannot disagree.

The Cask's `url` points at this repository's own releases. That is the whole difference from a
private-source project, which has to publish assets to a separate public repository first and then
point the Cask there — being public removes that hop, and with it the token that guarded it. The push
into the tap still needs `secrets.RELEASES_TOKEN`: `GITHUB_TOKEN` is scoped to the repository that
started the run, so it cannot write to another one no matter what permissions it is given.

`version` and `sha256` are interpolated by the shell that writes the file; `#{version}` inside the
`url` is Ruby interpolation Homebrew evaluates itself, which is why the heredoc is unquoted but that
one string survives it. Keeping both means the version appears once.

The Cask installs the same unsigned bundle as the zip, so Gatekeeper treats it the same way — a tap
is a download convenience, not a substitute for notarization.

### `allowBuilds` is what lets the frontend build at all

pnpm refuses to run a dependency's install scripts unless the project names it, and esbuild — Vite's
bundler — is such a dependency. Unapproved, `pnpm install` exits non-zero with
`ERR_PNPM_IGNORED_BUILDS`, which fails `frontend:install` and therefore every `wails build` and `wails
dev`. `frontend/pnpm-workspace.yaml` grants exactly one:

```yaml
allowBuilds:
  esbuild: true
```

The same approval is spelled a second time in `package.json` as `pnpm.onlyBuiltDependencies`, and both
have to stay. pnpm 11 reads only `allowBuilds` — it warns that the `package.json` field is ignored and
rewrites `pnpm-workspace.yaml` with an unanswered placeholder if the key is missing, failing the same
way. Older pnpm reads only the `package.json` field. CI installs whatever pnpm `corepack enable`
resolves to, so it is not the place to find out which of the two a version wanted.

Locally, each platform builds its own — the Windows one needs NSIS on PATH:

```powershell
wails build -platform windows/amd64 -nsis
```

```sh
wails build -platform darwin/universal
```

```sh
wails build -platform linux/amd64
```
