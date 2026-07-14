# AGENTS.md

## Cursor Cloud specific instructions

### What this is
A single, fully self-contained static PWA (a weekly-report tool, UI in Chinese) built with vanilla HTML/CSS/JS. There is **no build step, no package manager, no dependencies, and no backend**. All state lives in the browser (`localStorage`), and Excel files are generated/parsed entirely client-side. See `README.md` for feature usage.

### Running it (dev)
Serve the repo root over HTTP (do **not** open via `file://` — the service worker in `sw.js` and PWA features require an `http(s)` origin):

```
python3 -m http.server 8000
```

Then open `http://localhost:8000/index.html`.

### Lint / test / build
There is no lint, test, or build tooling in this repo. "Building" the app just means serving the static files as-is.

### Non-obvious notes
- Login is by name only. The name `周南` (see `LEADER_NAME` in `app.js`) unlocks the extra "收集汇总" (collector/aggregation) panel; any other name is a regular member.
- The Excel import parser only accepts **uncompressed (stored)** `.xlsx` files produced by this app itself (see `unzipStoredEntries` in `app.js`); arbitrary Excel files will be rejected.
- After changing `sw.js` or cached assets, the service worker may serve stale files. Bump `CACHE_NAME` in `sw.js` or hard-reload / clear site data to pick up changes during development.
