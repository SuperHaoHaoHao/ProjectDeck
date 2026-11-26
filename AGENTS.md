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
```

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

## Definition of done

- `npm run typecheck` passes
- `npm run build` passes
- Manual check: dashboard renders, scan report opens, a project can start/stop, logs stream, no orphan process
- If UI text changed: both languages checked (`?lang=en` / `?lang=zh`)
- If API changed: README API table updated

## Roadmap

See `docs/design.md` and README. Next up: MCP server (stdio + HTTP), GitHub clone import, FRP read-only panel.
