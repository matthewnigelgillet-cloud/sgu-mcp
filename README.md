# SGU MCP

An MCP server for **The Skeptics' Guide to the Universe** podcast — search transcripts, look up
episodes, pull Science or Fiction, and search news items, all from inside Claude.

It ships in **three forms**:

1. **A local MCP server** (`npx sgu-mcp`) for Claude Desktop / Claude Code / any MCP client.
2. **A remote MCP connector** (Streamable HTTP) you can host so people connect their *own* Claude
   account and search the archive — no per-request cost to you.
3. **A zero-backend web archive** (`web/`) — a static site where search runs entirely in the
   visitor's browser, with an optional "Ask Claude" panel (bring your own API key).

Requires **Node ≥ 22.5** (uses the built-in `node:sqlite` — no native build step).

---

## Quick start (local MCP server)

```bash
# Claude Code
claude mcp add sgu -- npx -y sgu-mcp
```

Or add it to your MCP config manually (`~/.claude/mcp.json` or Claude Desktop's config):

```json
{
  "mcpServers": {
    "sgu": {
      "command": "npx",
      "args": ["-y", "sgu-mcp"]
    }
  }
}
```

Restart Claude, then try: *"What was the Science or Fiction theme on SGU 1075?"* or
*"Search SGU transcripts for cold fusion."*

The **live wiki/RSS tools work immediately**. The fast **local-archive tools** need an index —
download a prebuilt one in seconds:

```bash
npm run setup    # downloads the prebuilt full-text index (data/sgu.db)
```

…or build it yourself (see [Building the archive](#building-the-archive)).

---

## The two data layers

1. **Local archive** — every episode transcript scraped into `episodes/NNNN.md` (YAML frontmatter +
   clean Markdown) and indexed into a SQLite **FTS5** database (`data/sgu.db`) for instant,
   bm25-ranked, offline full-text search.
2. **Live wiki/RSS tools** — for the newest episodes (whose transcripts aren't on the wiki yet) and
   as a fallback before the archive is built.

### Data sources

No official SGU API exists (the website is a locked-down SPA). This server pulls from two reliable
public sources:

| Source | Used for |
|---|---|
| [sgutranscripts.org](https://www.sgutranscripts.org) (MediaWiki API) | transcript search, episode segments, news items, Science or Fiction, full transcript text |
| Podcast RSS feed (libsyn) | latest/recent episodes, release dates, audio URLs |

> **Note:** Transcripts are volunteer-made and lag the feed by a few weeks. The newest episodes show
> up in `get_latest_episodes` (RSS) before their transcript exists on the wiki.

## Tools

**Local archive (fast, offline, ranked — prefer these):**

| Tool | What it does |
|---|---|
| `search_episodes` | bm25-ranked FTS5 search over the whole archive (episode-level), highlighted snippets + metadata. Optional `field`: `transcript` / `news` / `title`. |
| `search_segments` | **Segment-level** search — returns the exact moments with **timestamp + speaker** ("jump to the moment"). Filters: `episode`, `speaker`, `year`. |
| `count_mentions` | Real **occurrence count** of a word/phrase across the archive, with breakdowns by year, by speaker, and top episodes. Answers "how many times did they say X?". |
| `semantic_search` | **Natural-language / conceptual** search. Blends vector similarity with BM25 (reciprocal-rank fusion). Needs the embedding index (`npm run embed`). |
| `get_episode_markdown` | Full Markdown doc (frontmatter + transcript) for an episode from the local archive. |
| `archive_stats` | Episode + segment counts, date range, and which embeddings are present. |

**Live wiki / RSS (newest episodes + fallback):**

| Tool | What it does |
|---|---|
| `search_transcripts` | Live full-text search of sgutranscripts.org. |
| `get_episode` | One episode by number: title, date, rogues, guests, quote of the week, segment outline (timestamps), news items + links, Science or Fiction, audio URL. |
| `get_latest_episodes` | The most recent episodes from the RSS feed (number, date, summary, audio). |
| `get_science_or_fiction` | The SoF theme + items + source links, and which item was the fiction (when machine-encoded; otherwise returns the segment transcript so the reveal can be read off). |
| `search_news_items` | Search the science news items the show has covered; returns topic, episode, link. |
| `get_transcript` | Cleaned transcript text — whole episode, or a single named section. |

---

## Building the archive

If you'd rather build the index from scratch instead of `npm run setup`:

```bash
npm run fetch    # scrape all ~1000 transcripts -> episodes/*.md  (resumable; skips existing)
npm run index    # build data/sgu.db (SQLite FTS5) from the .md corpus
```

`fetch` is polite (limited concurrency, rate-limited, retries) and **resumable** — re-running only
fetches missing episodes. Use `--force` to re-scrape, or `--only 1075,1074` for specific episodes.

### Segment index & semantic search

`npm run index` builds two layers from the corpus: the episode FTS index **and** a
**segment index** (one row per speaker turn, ~178k rows) that powers `search_segments`
(timecoded, per-speaker) and `count_mentions` (true occurrence counts).

For conceptual / natural-language search, build the embedding index:

```bash
npm run embed                          # local model (default) — no API key, no cost
EMBED_PROVIDER=openai npm run embed     # needs OPENAI_API_KEY (one-time, ~cents)
EMBED_PROVIDER=voyage npm run embed     # needs VOYAGE_API_KEY
```

Embeddings are **episode-level** (one vector each), computed once. `semantic_search` then
blends them with keyword ranking. The provider for *query* embedding is set by
`EMBED_PROVIDER` (default `local`, via `@xenova/transformers`, an optional dependency).

### A note on Science or Fiction answers

The fiction item is reliably structured **only** when the transcription bot encoded it
(`answerKnown: true`). Otherwise the reveal lives in the discussion prose, so the tool returns the
SoF segment transcript and `answerKnown: false` — Claude reads the answer from it.

---

## Remote MCP connector (search with your own Claude account)

Host the server over **Streamable HTTP** and people can add it as a connector in Claude (Desktop /
Code / Team / Enterprise), searching the archive with their own Claude subscription.

```bash
npm run build
SGU_MCP_TOKEN=$(openssl rand -hex 24) npm run start:http   # serves POST /mcp on :8788
```

- **Health check:** `GET /healthz`
- **MCP endpoint:** `POST /mcp` (stateless Streamable HTTP — a fresh server per request)
- **Auth:** if `SGU_MCP_TOKEN` is set, clients must send `Authorization: Bearer <token>`. If it's
  **not** set, the server binds to loopback only, so you can't accidentally expose an
  unauthenticated endpoint.

Add it in an MCP client with a bearer header, e.g. Claude Code:

```bash
claude mcp add --transport http sgu https://your-host.example.com/mcp \
  --header "Authorization: Bearer <token>"
```

**Deploy on Render:** `render.yaml` defines the connector as a Node web service
(`sgu-mcp-connector`). It downloads the prebuilt index at build time (no scraping), serves the same
12 tools, and reads `SGU_MCP_TOKEN` from the dashboard.

> **Public Claude.ai connector?** Anthropic's hosted Claude.ai expects a full **OAuth 2.1** flow for
> custom remote connectors. The bearer-token mode here is perfect for self-hosting and for
> Desktop/Code/Team custom connectors; putting an OAuth proxy (or an MCP-aware gateway) in front is
> the next step for a public listing. The tool layer is unchanged either way.

---

## The fan-facing web archive (`web/`)

A **fully static, zero-backend** search site. Search runs entirely in the visitor's browser — no
server, no API key — so it costs nothing to run no matter how much traffic it gets.

- **How it works:** the FTS5 database is served as a static file and queried in-browser via
  `sql.js-httpvfs` (SQLite compiled to WASM). HTTP range requests mean the browser only downloads
  the few KB of DB pages each query touches — not the whole file.
- **What fans can do:**
  - Full-text search across every transcript, bm25-ranked, with highlighted snippets.
  - **Counting questions** — "how many times was homeopathy mentioned in 2024?" → a number, a
    per-year breakdown, and the episodes themselves.
  - Filter by year; jump straight to the transcript or the audio.
  - **"Find by meaning" (semantic search)** with two modes, so it works for everyone and never
    costs *you* per query:
    - **Free** — embeds the query in the visitor's browser via `@xenova/transformers` (loads a
      ~25 MB model once). No key, no cost; a little slower.
    - **Best** — the visitor pastes their **own** OpenAI key; their browser calls OpenAI for the
      query embedding (fast, highest quality). Requires that you published OpenAI doc vectors once
      (`EMBED_PROVIDER=openai npm run embed`); otherwise the panel says so and Free mode still works.
    Doc vectors ship inside the static DB, so ranking happens entirely in the browser.
  - **Optional "Ask Claude"** — a BYOK panel where the visitor pastes *their own* Anthropic API key;
    their browser calls the API directly (never this site), and Claude answers from the top
    transcript excerpts, citing episode numbers. See [SECURITY.md](SECURITY.md).

### Build & run the web archive locally

```bash
npm run setup       # download the prebuilt index (or fetch + index yourself)
npm run web         # prepares web/sgu.db (single-file, vacuumed, range-ready)
npm run web:serve   # http://localhost:8787  (range-aware static server)
```

The `web/vendor/` files (`sql.js-httpvfs`) are committed so the site is self-contained and works
offline — browsers block cross-origin Worker scripts, so they must be served same-origin.

### Deploy the website to Render

`render.yaml`'s `sgu-archive` static site downloads the prebuilt index and prepares the browser DB —
**no scraping at deploy time**, so deploys are fast and gentle on the volunteer wiki:

```
buildCommand:      npm ci && npm run setup && npm run web
staticPublishPath: ./web
```

---

## How the archive stays fresh

`.github/workflows/publish-db.yml` runs **monthly** (and on demand) in GitHub's cloud — works with
your Mac closed. It scrapes new transcripts, rebuilds the index, and publishes it to the `db-latest`
GitHub Release. Everything downstream (`npm run setup`, the connector, the website) just downloads
that artifact — one polite scrape feeds them all. If you set a `RENDER_DEPLOY_HOOK_URL` repo secret,
it also pings Render so the website redeploys with the new data.

## Development

- `npm run dev` — run the stdio server from source with `tsx` (no build step)
- `npm run dev:http` — run the HTTP connector from source
- `npm run smoke` — live test against SGU sources
- Source: `src/` — `server.ts` (the 12 tools), `index.ts` (stdio entry), `http.ts` (HTTP entry),
  `wiki.ts` (MediaWiki client), `rss.ts` (feed), `parse.ts` (wikitext parsers), `db.ts` (FTS5 +
  segments + vectors), `segments.ts` (speaker-turn parser), `embeddings.ts` (providers)

See [CONTRIBUTING.md](CONTRIBUTING.md). Code is MIT ([LICENSE](LICENSE)); transcript/audio content
belongs to their authors — this is an unofficial fan tool.
