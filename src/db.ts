// Local SQLite FTS5 index over the episode corpus. Zero native deps — uses
// Node's built-in node:sqlite (Node >= 22.5, stable on 25).
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Frontmatter } from "./markdown.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// dist/db.js -> project root -> data/sgu.db
export const DB_PATH = join(__dirname, "..", "data", "sgu.db");

export function openDb(path = DB_PATH, { create = false } = {}): DatabaseSync {
  const db = new DatabaseSync(path, { readOnly: !create });
  db.exec("PRAGMA journal_mode=WAL");
  return db;
}

export function initSchema(db: DatabaseSync): void {
  // Metadata table (one row per episode) + FTS5 index over searchable text.
  db.exec(`
    CREATE TABLE IF NOT EXISTS episodes (
      episode INTEGER PRIMARY KEY,
      title TEXT,
      date TEXT,
      theme TEXT,
      rogues TEXT,
      guests TEXT,
      sof_fiction_item INTEGER,
      sof_answer_known INTEGER,
      quote TEXT,
      quote_author TEXT,
      audio_url TEXT,
      transcript_url TEXT,
      news_json TEXT,
      path TEXT
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS episodes_fts USING fts5(
      episode UNINDEXED,
      title,
      news,
      transcript,
      tokenize = 'porter unicode61'
    );
  `);
}

export interface IndexRow {
  fm: Frontmatter;
  path: string;
  transcript: string; // plain text body for FTS
}

export function upsertEpisode(db: DatabaseSync, row: IndexRow): void {
  const { fm, path, transcript } = row;
  db.prepare("DELETE FROM episodes WHERE episode = ?").run(fm.episode);
  db.prepare("DELETE FROM episodes_fts WHERE episode = ?").run(fm.episode);
  db.prepare(
    `INSERT INTO episodes (episode,title,date,theme,rogues,guests,sof_fiction_item,sof_answer_known,quote,quote_author,audio_url,transcript_url,news_json,path)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    fm.episode,
    fm.title,
    fm.date,
    fm.theme,
    JSON.stringify(fm.rogues),
    JSON.stringify(fm.guests),
    fm.sof_fiction_item,
    fm.sof_answer_known ? 1 : 0,
    fm.quote_of_the_week,
    fm.quote_author,
    fm.audio_url,
    fm.transcript_url,
    JSON.stringify(fm.news_items),
    path
  );
  const news = fm.news_items.map((n) => n.title).join("\n");
  db.prepare("INSERT INTO episodes_fts (episode,title,news,transcript) VALUES (?,?,?,?)").run(
    fm.episode,
    fm.title,
    news,
    transcript
  );
}

export interface SearchResult {
  episode: number;
  title: string;
  date: string | null;
  theme: string | null;
  score: number;
  snippet: string;
  field: string;
}

// Full-text search across the corpus, bm25-ranked, with highlighted snippets.
export function searchCorpus(
  db: DatabaseSync,
  query: string,
  limit = 10,
  field?: "title" | "news" | "transcript"
): SearchResult[] {
  // Column filtering is applied via the FTS match string ({field} : (query)) below.
  // Snippet from transcript (col 3) by default; bm25 weights title/news higher.
  const sql = `
    SELECT f.episode AS episode,
           e.title AS title,
           e.date AS date,
           e.theme AS theme,
           bm25(episodes_fts, 0.0, 8.0, 4.0, 1.0) AS score,
           snippet(episodes_fts, ${field === "news" ? 2 : 3}, '[[', ']]', ' … ', 12) AS snippet
    FROM episodes_fts f
    JOIN episodes e ON e.episode = f.episode
    WHERE episodes_fts MATCH ?
    ORDER BY score
    LIMIT ?`;
  const match = field ? `{${field}} : (${query})` : query;
  const rows = db.prepare(sql).all(match, limit) as any[];
  return rows.map((r) => ({
    episode: r.episode,
    title: r.title,
    date: r.date,
    theme: r.theme,
    score: r.score,
    snippet: r.snippet,
    field: field ?? "all",
  }));
}

export function getEpisodeMeta(db: DatabaseSync, episode: number): any | null {
  const r = db.prepare("SELECT * FROM episodes WHERE episode = ?").get(episode) as any;
  if (!r) return null;
  return {
    ...r,
    rogues: JSON.parse(r.rogues || "[]"),
    guests: JSON.parse(r.guests || "[]"),
    news_items: JSON.parse(r.news_json || "[]"),
    sof_answer_known: !!r.sof_answer_known,
  };
}

export function corpusStats(db: DatabaseSync): { episodes: number; earliest: string | null; latest: string | null } {
  const c = db.prepare("SELECT COUNT(*) n, MIN(date) lo, MAX(date) hi FROM episodes").get() as any;
  return { episodes: c.n, earliest: c.lo, latest: c.hi };
}
