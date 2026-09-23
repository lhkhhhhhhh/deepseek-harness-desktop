# DeepSeek Harness Desktop

**Turn the DeepSeek Harness web GUI into a real Windows desktop application.**

Double-click an icon, get the Harness window. No browser tab, no terminal, no
`npx`, no server you have to remember to start.

This project is the *desktop shell* around DeepSeek Harness. It does not fork,
patch, or reimplement the Harness: it starts the Harness exactly as the CLI does
(`dsh web`) and shows the GUI that service serves inside a normal application
window, with a real taskbar entry, icon, and installer.

> **Unofficial.** This is a community desktop wrapper. DeepSeek Harness itself is
> developed by DeepSeek at [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
> and is not affiliated with this project.

---

## Download

Grab the installer from the [Releases](../../releases) page:

| File | What it does |
| --- | --- |
| `DeepSeek-Harness-Setup-<version>.exe` | Installs the app, creates a desktop shortcut and a Start Menu entry, registers an uninstaller. |
| `DeepSeek-Harness-Portable-<version>.exe` | Runs without installing anything. No shortcut is created. |

The installer is per-user: it does **not** need administrator rights and installs
into `%LOCALAPPDATA%\Programs\DeepSeek Harness`. The Harness runtime is bundled,
so the first launch works offline.

**Requirement:** [Node.js](https://nodejs.org) 20 or newer. The Harness itself is
a Node program; if Node is missing the app tells you so instead of failing
silently.

## What you get

- **Double-click to start.** The local Harness service is detected, started when
  needed, and waited on before the window appears.
- **A real window.** Own icon, own title bar, own taskbar button
  (`AppUserModelId: ai.deepseek.harness.desktop`), remembered size and position.
- **No console windows.** The service is spawned hidden; nothing flashes on
  screen.
- **Your Harness, unchanged.** Same profile, same plugins, same features as
  `dsh web`.
- **Your data stays yours.** Credentials, API keys, settings, and sessions live
  in the standard `~/.dsh` directory, shared with the CLI.
- **Never fights for a port.** The service binds an OS-assigned free port.
- **Clean shutdown.** Closing the window stops the service; nothing is left
  running in the background.

## How it works

```
double-click the icon
  └─ splash window (no console)
      ├─ 1. locate Node.js            (PATH, Program Files, nvm, Volta, scoop, ...)
      ├─ 2. locate the Harness runtime (bundled resources/dsh-runtime, then npx cache)
      ├─ 3. locate DSH_HOME            (~/.dsh by default - shared with the CLI)
      ├─ 4. is the local service already up?
      │       ├─ yes -> reuse it
      │       └─ no  -> spawn `dsh web --port 0 --no-open` (hidden, no browser handoff)
      ├─ 5. wait for readiness         (parse the launch URL, poll the HTTP surface)
      ├─ 6. exchange the launch token  (obtains the browser-session cookie)
      └─ 7. show the Harness window
```

The Harness refuses unauthenticated requests by design: every process mints a
random launch token, and a `GET /?token=...` returns a signed, host-bound
session cookie. The client performs that exchange on startup and keeps the
cookie in its own persistent Electron partition, which is why you are never
asked to log in again and why the address bar stays a clean `http://127.0.0.1/`.

## Build from source

```powershell
git clone https://github.com/<you>/dsh-desktop.git
cd dsh-desktop            # whatever you named the clone

npm install                 # electron + electron-builder
npm run fetch:runtime       # downloads the pinned Harness runtime (~200 MB)
npm run doctor              # environment self-check

npm start                   # run the app
npm run dist                # build the installer + portable exe into release/
```

`npm run dist` runs `tools/verify-assets.js` first, so a missing icon or runtime
fails immediately instead of producing a broken installer.

The runtime version is pinned in `package.json`:

```json
"dshRuntime": { "version": "0.1.5-rc.2" }
```

Useful scripts:

| Script | Purpose |
| --- | --- |
| `npm start` | Run the desktop client from source. |
| `npm run dev` | Same, with a console log and without the first-run workspace picker. |
| `npm run doctor` | Report Node, runtime, DSH_HOME, workspace, and port resolution. |
| `npm run smoke` | Start the service headlessly and verify the auth handshake (no window). |
| `npm run fetch:runtime` | Install the pinned Harness runtime. `--from-npx` reuses a local copy offline. |
| `npm run dist` / `dist:portable` | Build installers. |

### Layout

```
src/main/
  main.js               Electron main process: boot flow, window, menu, lifecycle
  harness-service.js    spawn / readiness probe / shutdown of `dsh web`
  dsh-runtime.js        Harness runtime + DSH_HOME resolution
  node-runtime.js       Node.js discovery and version check
  workspace-prefs.js    first-run workspace picker and remembered workspaces
  settings.js           desktop settings persistence
  menu.js               application menu
  resources.js          static asset paths in dev and packaged builds
build/
  IconPainter.cs        icon geometry
  make-icon.ps1         regenerates build/icon.ico
tools/
  doctor.js             environment diagnostics
  smoke-launch.js       headless launch-chain test
  fetch-runtime.js      downloads the Harness runtime
  verify-assets.js      pre-build asset guard
  capture-window.ps1    screenshot helper for manual verification
  build-mirrored.ps1    build using China-friendly mirrors
  prepare-builder-tools.ps1  packaging workaround for unprivileged Windows accounts
runtime/dsh-runtime/    fetched runtime (git-ignored, bundled by the installer)
```

## Data and configuration

The client adds no configuration system of its own. Everything Harness-related
stays where the CLI keeps it:

| What | Where |
| --- | --- |
| API keys and credentials | `~/.dsh/.credentials.yaml` |
| Harness settings | `~/.dsh/settings.yaml` |
| Sessions | `~/.dsh/sessions/` |
| Profiles and plugins | `~/.dsh/profiles/` |
| Browser session cookie | `%APPDATA%\DeepSeek Harness\Partitions\dsh-desktop\` |
| Desktop settings (workspace, window, theme) | `%APPDATA%\DeepSeek Harness\desktop.json` |
| Startup log | `%APPDATA%\DeepSeek Harness\desktop.log` |

Because `DSH_HOME` is shared, the CLI and the desktop app see the same
credentials, settings, plugins, and history. Switch between them freely.

## Menus

- **File** - copy the GUI link, choose the workspace, open the Harness data
  folder, exit.
- **View** - reload, zoom, full screen, appearance (follow Windows / light /
  dark).
- **Service** - restart the local Harness service, open the log file.
- **Help** - Harness documentation, about.

External links open in your default browser; the Harness surface itself stays in
the app window. Launching the app twice focuses the existing window instead of
starting a second service.

## Environment variables

Everything here is optional and exists for diagnostics.

| Variable | Effect |
| --- | --- |
| `DSH_DESKTOP_NODE` | Explicit `node.exe` path. |
| `DSH_DESKTOP_RUNTIME` | Explicit Harness runtime directory (the one containing `@deepseek-ai`). |
| `DSH_HOME` | Harness data directory. |
| `DSH_DESKTOP_SETTINGS_DIR` | Where desktop settings are stored. |
| `DSH_DESKTOP_GPU=1` | Enable hardware acceleration (off by default to avoid blank windows on some drivers and RDP sessions). |
| `--dsh-dev` | Dev mode: skip the workspace picker, mirror service output to the console. |

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| "Node.js was not found" | Install Node.js 20+ from [nodejs.org](https://nodejs.org). The dialog lists every path that was tried. |
| Window stays blank | Start with `DSH_DESKTOP_GPU=1` to test hardware acceleration, or check `desktop.log`. |
| First launch is slow | The Harness initializes its profile and plugin graph on first run (15-30 s). Later launches take a few seconds. |
| Something else | `Service -> Open log file`, or run `npm run doctor`. |

## Why Electron and not Tauri

- The Harness GUI is already a complete web application served by `dsh web`, so
  the shell only has to launch a process and host a window. Tauri would add a
  Rust/MSVC toolchain requirement without removing the Node service.
- The Harness project itself reserves the `desktop` profile name for an
  Electron-owned shell, so this matches the upstream direction.
- Electron ships a fixed Chromium, so rendering does not depend on whichever
  browser the user happens to have installed.

## License

[MIT](LICENSE) for this desktop client.

DeepSeek Harness is a separate project by DeepSeek, licensed under MIT; its
packages are fetched at build time and are not redistributed in this repository.
"DeepSeek" and "DeepSeek Harness" are trademarks of their respective owner and
are used here only to describe what this client runs.
