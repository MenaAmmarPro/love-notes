# Our Notes ✎ — Love for Mena

A quiet scratchpad for the little thoughts we want to keep — lists, song ideas,
half-finished letters. Write it down, tag it, colour it, pin it, and it waits
here exactly where you left it. Part of the **Love for Mena** collection.

**Live:** https://menaammarpro.github.io/love-notes/

## What it does

- **Write freeform notes** with a title and body — no structure, just thoughts
- **Autosave** as you type (no save button needed; one is there anyway)
- **Tags** — comma-separated, shown as little chips you can filter by
- **Colour** each note white / pink / purple / gold
- **Pin** the notes you want always at the top
- **Search** across titles, bodies and tags while typing
- **Word count** for the note you're editing
- **Export / import** all notes as a JSON file
- Deep link to a single note: `?note=<id>`
- No tracking, no network calls — everything stays local
- Installable PWA with offline support

## How it works

All the logic lives in pure functions exposed on `window.MenaNotes`, so it can be
tested without a browser. Notes are kept in `localStorage` under `mena-notes` as:

```json
{ "notes": [ { "id": "…", "title": "…", "body": "…", "tags": [], "color": "white", "pinned": false, "updatedAt": 0 } ] }
```

The four colours are the `data-color` buttons in `index.html`, and each maps to an
accent in `js/app.js` (`COLOURS`). Import accepts either this envelope, a bare
array of notes, or `{ "notes": [...] }`.

## Files

- `index.html` — the page
- `css/theme.css` — shared love-theme (copied from `_love-theme/`)
- `css/app.css` — page-specific styles (notebook + editor)
- `js/theme-main.js`, `js/effects.js` — shared behaviour/effects
- `js/app.js` — notes logic (`window.MenaNotes`) and DOM wiring
- `manifest.webmanifest`, `sw.js` — PWA
- `test/harness.js` — dependency-free Node harness
- `assets/` — favicon and icons

## Tests

```powershell
node --check js/app.js
node test/harness.js
```

## Run locally

```powershell
py -m http.server 8000
```

Then visit http://localhost:8000.

## Deploy

Static site, deployed with GitHub Pages from `main`.

## License

Creative Commons BY-NC-ND 4.0 — see [`LICENSE`](LICENSE).
© 2026 Ammar (MenaAmmarPro). Made with care for Mena.
