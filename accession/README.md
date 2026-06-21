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

## The search database

Search and the reference desk both run off `sgu.db` (~75 MB) in the browser via
`sql.js-httpvfs`, which fetches only the DB pages each query touches over HTTP **range
requests**. The DB is served **same-origin at `/sgu.db`**, so the host must honour range
requests (Render does; Cloudflare Pages does not, reliably). `VITE_DB_URL` can point the
app at a different host if needed.

## Deploy to Render (free, no Cloudflare)

One Render **static site** serves both the app and the DB, same-origin — no second service,
no CORS. Prerequisite: run the **"Publish prebuilt index"** GitHub Action once so the build
can download `sgu.db`.

Then: Render → **New → Blueprint** → connect the repo. `render.yaml` defines the `sgu-archive`
static site, which builds the ACCESSION app, downloads + strips the index, and bundles it at
`/sgu.db`. (A second optional `sgu-mcp-connector` service appears — skip/suspend it; only the
static site is needed.)

The BYOK reference desk calls Anthropic directly from the browser, so no server is needed.

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
