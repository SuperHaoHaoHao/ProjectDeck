# ProjectDeck Design

## Problem

Developers who use AI coding agents accumulate many local repositories: web services, desktop apps, mini programs, mobile apps, plugins, docs-only folders. Three things break down:

1. **Discovery** — "what projects do I even have?"
2. **Understanding** — "what is this folder, what stack, where is the README?"
3. **Control** — "how do I start it, which port, why did it fail?"

Existing tools only cover one slice: PM2 knows processes, Dockge knows containers, Homepage knows links, Backstage needs per-repo metadata and is built for orgs. The intersection — **local discovery + project knowledge + lifecycle control** — is empty.

## Product definition

A local web app started with one command. It is:

- a **catalog** of runnable local projects
- a **control deck** for start/stop/restart and live logs
- an **HTTP API** that an MCP server can expose to agents (roadmap)

It is not: a deployment platform, a CI system, a code host, a Docker panel, or a remote shell.

## Core model

### Project

| Field | Source |
| --- | --- |
| id | sha1 of absolute path |
| kind | service / desktop / miniapp / mobile / package / docs |
| runtime | node / python / go / rust / java / swift / android |
| stack | markers + `package.json` deps, including workspace children |
| entry | detected start command (cwd, cmd, args) |
| ports | config files, env, scripts, `lsof` |
| status | managed process + port ownership |
| git | branch, dirty count, last commit, remote |
| createdAt | filesystem birth time |

### Driver vs recipe

The most important split:

- **Driver** — who supervises the process: ProjectDeck, pm2, Docker, launchd.
- **Recipe** — how a stack is detected, started, and where its port comes from.

Language support is a *recipe* problem, not a driver problem. v0.0.2 ships one driver: a direct `spawn` with a process group. pm2/Docker drivers can be added later behind the same interface.

### Takeover modes

| Mode | Meaning | Capability |
| --- | --- | --- |
| managed | started by ProjectDeck | start/stop/restart + logs |
| adopted | already running outside ProjectDeck | observe; adopt later |
| observed | managed by Docker/launchd | read-only |

## Architecture

```text
┌────────────────────────────────────────────┐
│ React SPA                                   │
│ dashboard / list / detail / terminal / scan │
└──────────────────┬─────────────────────────┘
                   │ HTTP + SSE
┌──────────────────▼─────────────────────────┐
│ Fastify                                     │
│ catalog · control · logs · static           │
└──────────────────┬─────────────────────────┘
                   │
┌──────────────────▼─────────────────────────┐
│ scanner · detector · port probe             │
│ process manager · config store              │
└─────────────────────────────────────────────┘
```

## Scanning

1. Walk each configured root up to `maxDepth`.
2. Detect markers: `package.json`, uni-app manifest, Xcode project, `Package.swift`, Android manifest, `go.mod`, `Cargo.toml`, `pom.xml`, Python project files, compose files.
3. Index only runnable projects (start command or desktop/mini-program/mobile).
4. Skip heavy or vendor directories (`node_modules`, `sdk`, `uni_modules`, SDK demos).
5. Stop descending after a project is detected, except `plugins/`.

Filtered folders are returned with a reason code so the scan report stays explainable.

## Process management

- Spawn the detected entry with `detached: true` to create a process group.
- Capture stdout/stderr, keep a ring buffer, append to `~/.projectdeck/logs/<id>.log`.
- Stream chunks to the browser over SSE; render ANSI colors client-side.
- Stop sends `SIGTERM` to the process group, then `SIGKILL` after 4s.
- On server shutdown, all managed process groups are terminated.

### Reporting failure instead of faking success

A spawned command can exit immediately (`npm run dev` with no `node_modules`, a port already in
use, a missing script). Returning `ok: true` there is the difference between a usable tool and a
broken one, so `start` observes the process for 2s and classifies output:

| Code | Trigger |
| --- | --- |
| `port-in-use` | `EADDRINUSE`, `address already in use` |
| `missing-deps` | `Cannot find module`, `MODULE_NOT_FOUND`, `ModuleNotFoundError` |
| `missing-script` | `Missing script`, `command not found` |
| `missing-runtime` | spawn `ENOENT` |
| `permission` | `EACCES`, `permission denied` |
| `unknown` | exited non-zero with no recognised line |

`start()` returns `{ ok, runtime, failure }`. An explicit stop is tracked separately, because a
killed npm exits with code 143 rather than a signal — without that flag every stop would look like
a crash.

Some runners (e.g. a monorepo `concurrently` wrapper) stay alive while one child dies; the failure
is then attached to a still-running project and shown as an alert rather than flipping the status.

### Dependencies

Detection records `{ manager, hasManifest, installed }` per project (`node_modules` is searched up
to three parent levels for hoisted monorepos). Missing dependencies are shown as a hint and a
one-click `npm|pnpm|yarn|bun install` that runs through the same process manager, so install output
streams into the same terminal. Only known package managers with fixed arguments are ever spawned.

## Testing

| Layer | What it proves |
| --- | --- |
| Unit | detection, dependency state, port ownership, failure classification, config parsing |
| Integration | a real server on a random port: scan filtering + reasons, start, SSE chunks, process-group stop with no orphan, failure reporting, install command |
| E2E | a real browser against the built UI: start from the list, running state, live terminal, stop, failure banner, language switch |

Everything runs against `test/fixtures` copied to a temp dir, with `PROJECTDECK_HOME` pointing at a
temp state directory, so tests never start the user's projects or touch `~/.projectdeck`.

## Status correctness

A TCP port being open does **not** mean the project is running. ProjectDeck builds a listener map with `lsof` and resolves each PID's working directory. A project is running only if it owns a listening port, or if its managed process is alive.

A port is never "held by the OS". If `EADDRINUSE` shows up, some live process is listening. The usual
reasons:

| Cause | Example |
| --- | --- |
| Orphan | parent shell/agent dies, child is reparented to launchd (PID 1) and keeps running for days |
| Wrong kill target | `kill` hits `npm`, but `npm → node cli → npm → npm → vite` keeps the socket open |
| `SIGKILL` | no cleanup handler, children never receive a signal |
| Duplicate start | an older stack from another terminal/session is still alive |

Path normalization matters here: `lsof` reports `/private/var/...` while the project may be known as
`/var/...`, so ownership is compared on real paths (`belongsTo`).

### Reaping stale ports

Before a start, the project's declared ports are checked. If a listener's working directory is inside
the project, it is a leftover of that same project and gets `SIGTERM` (then `SIGKILL` after 2s). Any
other process is never touched: the start fails with `port-in-use` and the log records which PID and
directory hold the port. This replaces per-project "detect and kill" scripts.

Monorepo ports are discovered from child packages too (`server/.env`, `apps/web/vite.config.ts`,
`client/package.json` scripts), because the root `package.json` usually declares nothing.

### Observed ports

Declared ports miss anything hardcoded in source (`const PORT = Number(process.env.PORT || 8365)`
in `tools/dev.js`). Every API response re-runs the `lsof` listener map and attributes each listener
to the **deepest** project path containing its working directory:

```text
:8365  cwd .../pikiboo/plugins/delta-gun-codes  → delta-gun-codes (observed)
:5175  cwd .../pikiboo/plugins/fret-flow        → fret-flow (observed)
:5173  cwd .../pikiboo/apps/web                 → pikiboo (declared)
```

Deepest-path attribution matters: without it the parent monorepo would claim every plugin's port,
and a plugin would show a green chip for a port owned by its parent. Ports are refreshed per request,
so start/stop flips the port colour immediately without walking the filesystem again.

### Stable port proxy

frpc and reverse proxies need a port that does not change. A dev server that falls back from 5173 to
5174 breaks that config every time. A `PortProxy` solves it without touching the project: ProjectDeck
listens on a fixed port and forwards each incoming connection to the project's *current* port,
resolved at connect time from the same listener map (declared port first, preferred `target` if set).

```text
frpc → 127.0.0.1:9100 (stable, owned by ProjectDeck)
                   └→ resolved per connection → 127.0.0.1:8365 (whatever the project is on now)
```

Config lives in `stablePorts` (`projectId → { port, target?, name?, path? }`), is persisted in
`config.json`, and is editable from the project detail page.

| Concern | Decision |
| --- | --- |
| Who picks the port | ProjectDeck auto-allocates from 9100–9199, skipping ports already assigned or listening; a port can also be typed in |
| Which real port to forward to | `target` when set (needed for multi-port projects: pikiboo web 5173 vs API 3000), otherwise the first owned port |
| Remembering the mapping | `config.json` keyed by `projectId` (sha1 of the path); `name`/`path` are stored alongside so a moved directory can be re-matched by path on the next scan |
| Surviving restarts | proxies are re-listened from config on boot; if a project is not running the proxy still listens and refuses connections until the project comes back |
| IPv4 vs IPv6 | the upstream is dialed on `127.0.0.1`, then `::1`, then `localhost`, because Vite on macOS often binds `[::1]` only |

## Security

- Bind `127.0.0.1` by default.
- Only registered entry commands are executed; there is no free-form shell.
- Paths come from the scan roots; the UI never accepts arbitrary commands.
- Destructive operations are limited to start/stop/restart.

## Roadmap

| Version | Scope |
| --- | --- |
| v0.1 | MCP server (stdio + HTTP), GitHub clone import, manual add, pm2 driver |
| v0.2 | FRP read-only panel, Docker driver, launchd observe |
| v0.3 | Adopt external processes, metrics history, notes/tags |
| v1.0 | Recipe marketplace, Tauri desktop shell, multi-machine |
