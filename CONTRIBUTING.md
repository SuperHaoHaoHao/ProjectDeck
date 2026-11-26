# Contributing

Thanks for helping improve ProjectDeck.

## Setup

```bash
git clone git@github.com:SuperHaoHaoHao/ProjectDeck.git
cd ProjectDeck
npm install
npm run dev   # API 4321, Vite 5310
```

## Before opening a PR

- `npm run typecheck` and `npm run build` pass
- UI changes verified in both Chinese and English (`?lang=zh` / `?lang=en`)
- New user-visible strings added to **both** dictionaries in `src/web/lib/i18n.tsx`
- New server error/skip reasons are **codes**, translated in the UI
- No `node_modules`, `dist`, logs, or secrets committed

## Adding support for a new stack

1. Add the marker and entry recipe in `src/server/detect.ts`
2. Add port hints in `src/server/ports.ts` if the stack has a conventional port
3. Add the marker to the table in `README.md`
4. Test against a real project folder

## Commit style

Conventional commits are appreciated:

```
feat: add Docker compose driver
fix: do not mark a port owned by another project as running
docs: update scan rules
```

## Security

ProjectDeck can start local processes. Never introduce a path that executes arbitrary user input as a shell command. Only registered start commands may be spawned.
