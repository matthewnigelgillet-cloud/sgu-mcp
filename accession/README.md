# SGU Archive — ACCESSION

A premium, editorial **scientific-archive** homepage for the SGU Archive, built with
**React + Vite + Tailwind**. Museum / observatory / institution — not a dashboard.

```bash
npm install
npm run chunk    # split ../web/sgu.db into public/db/ parts (needed for search)
npm run dev      # http://localhost:5173
npm run build    # production bundle -> dist/
npm run preview
```

## The search database (chunked)

Search and the reference desk both run off `sgu.db` (~75 MB) in the browser via
`sql.js-httpvfs`. Cloudflare Pages caps any single file at 25 MiB, so the DB is **split
into <25 MiB parts** under `public/db/` (served as static assets, still range-fetched per
query). `npm run chunk` produces them from a local `../web/sgu.db`; `npm run fetch-db`
downloads the prebuilt DB from the `db-latest` GitHub release first (for CI). Both `public/db/`
and `.dbsrc/` are gitignored.

## Deploy to Cloudflare Pages (free)

Prerequisite: the `db-latest` release must exist — run the **"Publish prebuilt index"**
GitHub Action once so the build can download `sgu.db`.

Then create a Pages project from the GitHub repo with:

| Setting | Value |
|---|---|
| Root directory | `accession` |
| Build command | `npm run build:cf` |
| Build output directory | `dist` |
| Environment variable | `NODE_VERSION` = `20` |

`build:cf` downloads the prebuilt DB, splits it into parts, then `vite build`. The BYOK
reference desk calls Anthropic directly from the browser, so no server is needed.

## What it is

A homepage that treats twenty years of *The Skeptics' Guide to the Universe* as a
catalogued **collection**, not a search utility.

- **Frame** — a fixed brass plate-frame with a running folio that tracks the active section.
- **Hero** — a title page: editorial masthead + a census line + the latest *accession*.
- **The Plate** (`Plate.jsx`) — a canvas spectrogram of the whole record, drawn as a matte
  *printed plate* (hue = date; redshift by year), with a calibration draw on first view and a
  brass cross-hair read-off on hover.
- **The Finding Aid** — search reframed as consultation; results are **accession records**
  (specimen labels), a ledger, not cards.
- **In Figures** — statistics as a self-counting **census** (odometer count-up), plus
  micro-stratigraphy bars. No KPI cards.
- **The Galleries** — exploration by rogue / segment / theme / era, plus a *Science or Fiction*
  exhibit you "break the seal" to adjudicate.
- **⌘K** — a sober command-palette "catalogue".

## Design system

Palette (`tailwind.config.js`): ink, plate, slate, **bone**, graphite, **verdigris** (the one
living accent), **brass** (gilt hairline), oxblood (semantic). Type: **Spectral** (the scholar),
**IBM Plex Mono** (the instrument — tabular figures), **IBM Plex Sans** (utility).

No gradients, no glassmorphism, no neon. Subtle, informational motion only; full
`prefers-reduced-motion` support. Mobile-first (the marginalia rail collapses to inline kickers).
