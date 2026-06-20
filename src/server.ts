// Shared MCP server factory — registers all SGU tools on a fresh McpServer.
// Both entrypoints use this: src/index.ts (stdio) and src/http.ts (Streamable HTTP).
// Data sources: sgutranscripts.org (MediaWiki API) + the podcast RSS feed.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as wiki from "./wiki.js";
import * as rss from "./rss.js";
import {
  parseInfoBox,
  parseNewsItems,
  parseScienceOrFiction,
  extractSectionText,
  cleanWikitext,
} from "./parse.js";
import { openDb, searchCorpus, getEpisodeMeta, corpusStats } from "./db.js";
import type { DatabaseSync } from "node:sqlite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

// The local FTS index is optional — the live wiki tools work without it.
// Open lazily and cache; surface a helpful message if it hasn't been built.
let _db: DatabaseSync | null = null;
let _dbTried = false;
function localDb(): DatabaseSync | null {
  if (_dbTried) return _db;
  _dbTried = true;
  try {
    _db = openDb(undefined, { create: false });
  } catch {
    _db = null;
  }
  return _db;
}

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function err(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: "sgu-mcp",
    version: "0.1.0",
  });

  // 1. Full-text transcript search ------------------------------------------
  server.registerTool(
    "search_transcripts",
    {
      title: "Search SGU transcripts",
      description:
        "Full-text search across all SGU episode transcripts and topic pages on sgutranscripts.org. " +
        "Use for questions like 'every time they discussed CRISPR' or 'what did they say about cold fusion'. " +
        "Returns matching pages with snippets, the episode number, and a wiki URL.",
      inputSchema: {
        query: z.string().describe("Search terms (MediaWiki full-text search syntax supported)"),
        limit: z.number().int().min(1).max(50).optional().describe("Max results (default 10)"),
      },
    },
    async ({ query, limit }) => {
      try {
        const hits = await wiki.search(query, limit ?? 10);
        return json({ query, count: hits.length, results: hits });
      } catch (e: any) {
        return err(`search_transcripts failed: ${e.message}`);
      }
    }
  );

  // 2. Episode lookup -------------------------------------------------------
  server.registerTool(
    "get_episode",
    {
      title: "Get an SGU episode",
      description:
        "Get a structured overview of one episode by number: title, date, rogues present, guests, " +
        "quote of the week, the segment outline (with timestamps), news items (with source links), " +
        "Science or Fiction, audio URL, and links. Combines the RSS feed (recent metadata + audio) " +
        "with the transcript wiki (segments + details). Use get_transcript for the full text.",
      inputSchema: {
        episode_number: z.number().int().positive().describe("Episode number, e.g. 1075"),
      },
    },
    async ({ episode_number }) => {
      try {
        const feed = await rss.getEpisodeFromFeed(episode_number).catch(() => null);
        const page = await wiki.parsePage(wiki.episodePageTitle(episode_number));
        if (!feed && !page) return err(`Episode ${episode_number} not found in feed or transcript wiki.`);

        const result: any = {
          episode: episode_number,
          title: feed?.title ?? page?.title ?? null,
          date: feed?.date ?? null,
          audioUrl: feed?.audioUrl ?? null,
          durationSeconds: feed?.durationSeconds ?? null,
          episodeUrl: feed?.link ?? `https://www.theskepticsguide.org/podcasts/episode-${episode_number}`,
          transcriptUrl: page ? wiki.pageUrl(page.title) : null,
          transcriptAvailable: !!page,
          feedSummary: feed?.summary ?? null,
        };

        if (page) {
          const info = parseInfoBox(page.wikitext);
          result.caption = info.caption;
          result.rogues = info.rogues;
          result.guests = info.guests;
          result.quoteOfTheWeek = info.quoteOfTheWeek;
          result.segments = page.sections.map((s) => {
            const ts = s.line.match(/\(?([\d]{1,2}:[\d]{2}(?::[\d]{2})?)\)?\s*$/);
            return {
              title: cleanWikitext(s.line.replace(/<small>.*?<\/small>/g, "")).trim(),
              timestamp: ts ? ts[1] : null,
              level: Number(s.level),
            };
          });
          result.newsItems = parseNewsItems(page.wikitext);
          const sof = parseScienceOrFiction(page.wikitext);
          if (sof) result.scienceOrFiction = sof;
        }
        return json(result);
      } catch (e: any) {
        return err(`get_episode failed: ${e.message}`);
      }
    }
  );

  // 3. Latest / recent episodes --------------------------------------------
  server.registerTool(
    "get_latest_episodes",
    {
      title: "Get latest SGU episodes",
      description:
        "List the most recent episodes from the podcast RSS feed: number, title, date, summary, audio URL. " +
        "Use to find the newest episode or recent ones. Note: transcripts lag a few weeks behind release.",
      inputSchema: {
        limit: z.number().int().min(1).max(30).optional().describe("How many recent episodes (default 5)"),
      },
    },
    async ({ limit }) => {
      try {
        const items = await rss.getLatest(limit ?? 5);
        return json({ count: items.length, episodes: items });
      } catch (e: any) {
        return err(`get_latest_episodes failed: ${e.message}`);
      }
    }
  );

  // 4. Science or Fiction ---------------------------------------------------
  server.registerTool(
    "get_science_or_fiction",
    {
      title: "Get Science or Fiction",
      description:
        "Get the Science or Fiction segment for an episode: the theme, the items (with source links), and " +
        "which item was the fiction WHEN it is machine-encoded (answerKnown=true). When answerKnown=false, " +
        "the reveal isn't in structured data — the transcript of the segment is included so the answer can be " +
        "read off the discussion.",
      inputSchema: {
        episode_number: z.number().int().positive().describe("Episode number, e.g. 1075"),
      },
    },
    async ({ episode_number }) => {
      try {
        const page = await wiki.parsePage(wiki.episodePageTitle(episode_number));
        if (!page) return err(`No transcript yet for episode ${episode_number} (transcripts lag release).`);
        const sof = parseScienceOrFiction(page.wikitext);
        if (!sof) return err(`No Science or Fiction data found in episode ${episode_number}.`);
        const out: any = { episode: episode_number, ...sof, transcriptUrl: wiki.pageUrl(page.title) };
        if (!sof.answerKnown) {
          out.note =
            "Fiction item not machine-encoded for this episode. Read the discussion below to find the reveal.";
          out.discussionTranscript = extractSectionText(page.wikitext, /Science or Fiction/i);
        }
        return json(out);
      } catch (e: any) {
        return err(`get_science_or_fiction failed: ${e.message}`);
      }
    }
  );

  // 5. News item search -----------------------------------------------------
  server.registerTool(
    "search_news_items",
    {
      title: "Search SGU news items",
      description:
        "Search the science news items the show has covered. Each news item is its own topic page tagged with " +
        "the episode number. Returns topic title, episode number, and link. Use to find which episode covered a " +
        "topic, or to survey coverage of a subject.",
      inputSchema: {
        query: z.string().describe("Topic search terms"),
        limit: z.number().int().min(1).max(50).optional().describe("Max results (default 10)"),
      },
    },
    async ({ query, limit }) => {
      try {
        const hits = await wiki.search(query, (limit ?? 10) * 2);
        // News-item topic pages have an episode number in parens and are not the
        // episode pages themselves.
        const newsItems = hits
          .filter((h) => !/^SGU Episode /i.test(h.title) && h.episode !== null)
          .slice(0, limit ?? 10)
          .map((h) => ({ topic: h.title.replace(/\s*\(\d+\)\s*$/, ""), episode: h.episode, snippet: h.snippet, url: h.url }));
        return json({ query, count: newsItems.length, results: newsItems });
      } catch (e: any) {
        return err(`search_news_items failed: ${e.message}`);
      }
    }
  );

  // 6. Full / sectioned transcript -----------------------------------------
  server.registerTool(
    "get_transcript",
    {
      title: "Get SGU transcript text",
      description:
        "Get the cleaned transcript text of an episode. By default returns the full transcript (can be long). " +
        "Pass a 'section' substring (e.g. 'Science or Fiction', a news item title, or 'Intro') to return only " +
        "that section's text. Use get_episode first to see the segment outline.",
      inputSchema: {
        episode_number: z.number().int().positive().describe("Episode number, e.g. 1075"),
        section: z
          .string()
          .optional()
          .describe("Optional: case-insensitive substring of a section heading to return just that section"),
      },
    },
    async ({ episode_number, section }) => {
      try {
        const page = await wiki.parsePage(wiki.episodePageTitle(episode_number));
        if (!page) return err(`No transcript yet for episode ${episode_number} (transcripts lag release).`);
        if (section) {
          const esc = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const text = extractSectionText(page.wikitext, new RegExp(esc, "i"));
          if (!text)
            return err(
              `Section matching "${section}" not found. Available: ${page.sections.map((s) => s.line).join(" | ")}`
            );
          return json({ episode: episode_number, section, text, url: wiki.pageUrl(page.title) });
        }
        return json({
          episode: episode_number,
          text: cleanWikitext(page.wikitext),
          url: wiki.pageUrl(page.title),
        });
      } catch (e: any) {
        return err(`get_transcript failed: ${e.message}`);
      }
    }
  );

  // 7. Fast local full-text search over the indexed markdown corpus -----------
  server.registerTool(
    "search_episodes",
    {
      title: "Search the SGU archive (local index)",
      description:
        "Fast, bm25-ranked full-text search over the LOCAL archive of episode transcripts (the indexed .md " +
        "corpus). Prefer this over search_transcripts for general questions — it's instant, offline, and ranked, " +
        "and it returns highlighted snippets with episode metadata. Optionally restrict to a field: " +
        "'transcript' (default scope is all), 'news' (news-item titles), or 'title'. " +
        "Falls back with a note if the index hasn't been built yet (run `npm run setup` or `npm run fetch && npm run index`).",
      inputSchema: {
        query: z
          .string()
          .describe("Search query. Supports MediaWiki/SQLite FTS syntax: phrases in quotes, AND/OR, prefix*"),
        limit: z.number().int().min(1).max(50).optional().describe("Max results (default 10)"),
        field: z.enum(["transcript", "news", "title"]).optional().describe("Restrict search to one field"),
      },
    },
    async ({ query, limit, field }) => {
      const db = localDb();
      if (!db)
        return err(
          "Local index not built yet. Run `npm run setup` to download a prebuilt index, " +
            "or build it from scratch with `npm run fetch` then `npm run index`. " +
            "You can use search_transcripts for live wiki search in the meantime."
        );
      try {
        const results = searchCorpus(db, query, limit ?? 10, field);
        return json({ query, field: field ?? "all", count: results.length, results });
      } catch (e: any) {
        return err(`search_episodes failed: ${e.message}`);
      }
    }
  );

  // 8. Serve an episode's full markdown from the local archive -----------------
  server.registerTool(
    "get_episode_markdown",
    {
      title: "Get archived episode markdown",
      description:
        "Return the full Markdown document (YAML frontmatter + clean transcript) for an episode from the local " +
        "archive. Frontmatter includes date, rogues, guests, theme, the Science-or-Fiction answer, news items with " +
        "links, audio URL, and source. Use after search_episodes to read the full text.",
      inputSchema: {
        episode_number: z.number().int().positive().describe("Episode number, e.g. 1075"),
      },
    },
    async ({ episode_number }) => {
      const db = localDb();
      if (!db) return err("Local index not built yet. Run `npm run setup` (prebuilt) or `npm run fetch && npm run index`.");
      const meta = getEpisodeMeta(db, episode_number);
      if (!meta) return err(`Episode ${episode_number} is not in the local archive.`);
      try {
        const md = await readFile(join(PROJECT_ROOT, meta.path), "utf8");
        return { content: [{ type: "text" as const, text: md }] };
      } catch (e: any) {
        return err(`Could not read ${meta.path}: ${e.message}`);
      }
    }
  );

  // 9. Archive stats -----------------------------------------------------------
  server.registerTool(
    "archive_stats",
    {
      title: "SGU local archive stats",
      description:
        "Report how many episodes are in the local indexed archive and the date range covered. Use to check " +
        "whether the archive is built and how complete it is.",
      inputSchema: {},
    },
    async () => {
      const db = localDb();
      if (!db)
        return json({
          built: false,
          message: "Run `npm run setup` to download a prebuilt archive, or `npm run fetch && npm run index` to build it.",
        });
      try {
        return json({ built: true, ...corpusStats(db) });
      } catch (e: any) {
        return err(`archive_stats failed: ${e.message}`);
      }
    }
  );

  return server;
}
