# AGENTS.md

Guidance for AI agents and contributors working on ProjectDeck.

ProjectDeck is a local-first catalog + control deck for AI-built projects. It scans local folders, detects runnable projects, and starts/stops them with live logs.

## Commands

```bash
npm install
npm run dev        # API 4321 + Vite 5310, /api proxied
npm run typecheck  # must pass
npm run build      # web → dist/web, server → dist/server
npm start          # run built app on 4321
npm test           # unit + API integration (fixtures in test/fixtures)
npm run test:e2e   # real browser: start → live logs → stop → failure banner → i18n
```

Tests never touch the real `~/.projectdeck`: they set `PROJECTDECK_HOME` to a temp dir and
scan a temp copy of `test/fixtures` on a random port.

## Architecture map

| Path | Responsibility |
| --- | --- |
| `src/server/main.ts` | Fastify app, REST routes, SSE, static serving |
| `src/server/scanner.ts` | Root walking, filtering, status merge |
| `src/server/detect.ts` | Project markers → kind / runtime / stack / entry |
| `src/server/ports.ts` | Port hints, `lsof` listener map, port ownership |
| `src/server/pm.ts` | Child process lifecycle, log ring buffer, SSE events |
| `src/server/config.ts` | `~/.projectdeck/config.json`, CLI args |
| `src/server/types.ts` | Shared server types (Project, ScanResult, …) |
| `src/web/App.tsx` | Layout, views, hash routing, polling, actions |
| `src/web/components/` | Dashboard, list, detail, terminal, scan modal, settings |
| `src/web/lib/i18n.tsx` | zh/en dictionaries + provider |

## Hard rules

1. **Every UI string goes through i18n.** Add the key to both `zh` and `en` in `src/web/lib/i18n.tsx`. Never hardcode user-visible text in components.
2. **Server returns codes, not localized text.** Example: `SkipReason = 'docs-only' | 'no-entry'`; the UI translates it. Do not put Chinese/English sentences in API payloads.
3. **Never execute arbitrary commands.** Only `Project.entry` (detected or user-declared) may be spawned. No custom shell input.
4. **Running state must verify ownership.** An open port is not enough; match the listener PID's working directory to the project path (`belongsTo`).
5. **New stack detection**: extend `detect.ts`, add the marker to the README table, and add a fixture-ish manual check against a real folder.
6. **Scan filtering**: only runnable projects are indexed. Anything filtered must produce a `SkippedItem` with a reason code so the scan report stays explainable.
7. **Platform**: macOS is the primary target (uses `lsof`). Linux works. Windows needs a `platform/` adapter before claiming support.
8. **Do not add a database** without a design discussion. Current state: JSON files in `~/.projectdeck/`.
9. **Core behavior needs a test.** Scan filtering, start/stop, SSE logs, failure classification, and dependency detection are covered in `test/`. If you change them, extend the tests — do not hand the user a checklist to click through.
10. **A failed start must never look successful.** `pm.start()` returns `{ ok, runtime, failure }`; `failure.code` is a code (`port-in-use`, `missing-deps`, `missing-script`, `missing-runtime`, `permission`, `unknown`) translated in the UI. An explicit stop must not produce a failure (npm exits with 143).
11. **Never kill a process you cannot prove belongs to this project.** The pre-start reaper may only kill listeners whose `cwd` is inside the project (compared on real paths), on a port the project declares. Foreign processes must fail the start with `port-in-use` and be reported, never killed.
12. **Ports are attributed to the deepest matching project path.** A plugin's port belongs to the plugin, not to the monorepo that contains it. `refreshObservedPorts` runs on every API response so start/stop is reflected without a rescan; do not add a second, divergent attribution rule.
13. **Stable ports are a proxy, not a mutation.** ProjectDeck listens on the stable port and forwards to whatever port the project actually uses, resolved at connect time. Never rewrite a project's config or scripts to force a port.
14. **Upstream connections must try both address families.** Vite on macOS often binds `[::1]` only; connecting to `127.0.0.1` alone yields an empty reply. `proxy.ts` dials `127.0.0.1` → `::1` → `localhost`, and there is a fixture test for it.
15. **Stable-port persistence is `config.json` keyed by project id** with `name`/`path` stored for readability and re-matching. Auto-allocation uses 9100–9199 and must skip ports assigned to other projects or already listening.

## Definition of done

- `npm run typecheck` passes
- `npm run build` passes
- `npm test` passes (add a case for new server behavior)
- `npm run test:e2e` passes when UI behavior changed
- If UI text changed: both languages checked (`?lang=en` / `?lang=zh`)
- If API changed: README API table updated

## Roadmap

See `docs/design.md` and README. Next up: MCP server (stdio + HTTP), GitHub clone import, FRP read-only panel.
