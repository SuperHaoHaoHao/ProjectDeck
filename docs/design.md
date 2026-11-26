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

## Status correctness

A TCP port being open does **not** mean the project is running. ProjectDeck builds a listener map with `lsof` and resolves each PID's working directory. A project is running only if it owns a listening port, or if its managed process is alive.

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
