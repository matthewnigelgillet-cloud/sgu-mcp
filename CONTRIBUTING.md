# Contributing to SGU MCP

Thanks for your interest! This is an unofficial fan project. Contributions of all
kinds are welcome — bug fixes, new tools, parser improvements, docs.

## Ground rules

- **Be gentle to the data sources.** Transcripts come from the volunteer-run
  [sgutranscripts.org](https://www.sgutranscripts.org) MediaWiki. The scraper is
  deliberately rate-limited and resumable. Don't remove those guards, and don't
  add features that hammer the wiki.
- **Code is MIT; content is not.** See [LICENSE](LICENSE). Don't commit scraped
  transcripts or the built database to git — they're reproducible artifacts and
  are `.gitignore`d on purpose.

## Setup

Requires **Node ≥ 22.5** (uses the built-in `node:sqlite`). `.nvmrc` pins 22.

```bash
npm install        # installs deps and builds dist/ via the prepare hook
npm run smoke      # live test against SGU sources (no archive needed)
```

To work with the local full-text archive:

```bash
npm run setup      # download a prebuilt index (fast), OR:
npm run fetch      # scrape transcripts -> episodes/*.md  (resumable, slow, polite)
npm run index      # build data/sgu.db (FTS5) from the corpus
```

## Project layout

| Path | What |
|---|---|
| `src/server.ts` | Shared tool registry — all 12 tools (used by both transports) |
| `src/index.ts` | MCP server (stdio) entrypoint |
| `src/http.ts` | MCP server (Streamable HTTP) entrypoint — remote / connector hosting |
| `src/segments.ts` | Speaker-turn parser + occurrence counter |
| `src/embeddings.ts` | Pluggable embedding providers (local / openai / voyage) |
| `src/wiki.ts` | MediaWiki API client |
| `src/rss.ts` | Podcast RSS client |
| `src/parse.ts` | Wikitext parsers (info box, news items, Science or Fiction) |
| `src/db.ts` | SQLite FTS5 index (read + write) |
| `scripts/` | fetch / index / build-web / download-db / smoke |
| `web/` | zero-backend static search site |

## Adding a tool

Register it in **both** `src/index.ts` (stdio) and the shared registration path so
it's available over HTTP too — see `src/server.ts` (the shared tool registry). Keep
tool descriptions specific and example-rich; the model relies on them to pick tools.

## Before opening a PR

- `npm run build` passes (no TypeScript errors).
- `npm run smoke` passes.
- New behavior is covered by a quick manual check described in the PR.
