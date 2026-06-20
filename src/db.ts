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
    -- Segment-level layer: one row per speaker turn. Enables occurrence counts,
    -- "jump to the moment" (timestamp), and per-speaker analytics.
    CREATE TABLE IF NOT EXISTS segments (
      id INTEGER PRIMARY KEY,
      episode INTEGER,
      seq INTEGER,
      date TEXT,          -- denormalized from the episode for fast time-grouping
      section TEXT,
      timestamp TEXT,     -- mm:ss / h:mm:ss start time, when known
      speaker TEXT,       -- normalized display name (Steve, Bob, guest, ...)
      text TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_segments_episode ON segments(episode);
    CREATE INDEX IF NOT EXISTS idx_segments_speaker ON segments(speaker);
    -- External-content FTS over segment text (repopulated via 'rebuild').
    CREATE VIRTUAL TABLE IF NOT EXISTS segments_fts USING fts5(
      text,
      content = 'segments',
      content_rowid = 'id',
      tokenize = 'porter unicode61'
    );
    -- Episode-level embedding store for semantic search (one vector per episode).
    CREATE TABLE IF NOT EXISTS embeddings (
      episode INTEGER,
      provider TEXT,      -- 'local' | 'openai' | 'voyage'
      model TEXT,
      dim INTEGER,
      vector BLOB,        -- Float32 little-endian
      PRIMARY KEY (episode, provider)
    );
  `);
}

export interface SegmentRow {
  episode: number;
  seq: number;
  date: string | null;
  section: string | null;
  timestamp: string | null;
  speaker: string;
  text: string;
}

export function clearEpisodeSegments(db: DatabaseSync, episode: number): void {
  db.prepare("DELETE FROM segments WHERE episode = ?").run(episode);
}

export function insertSegments(db: DatabaseSync, rows: SegmentRow[]): void {
  const stmt = db.prepare(
    "INSERT INTO segments (episode, seq, date, section, timestamp, speaker, text) VALUES (?,?,?,?,?,?,?)"
  );
  for (const r of rows) {
    stmt.run(r.episode, r.seq, r.date, r.section, r.timestamp, r.speaker, r.text);
  }
}

// Rebuild the external-content FTS from the segments table (run once after load).
export function rebuildSegmentsFts(db: DatabaseSync): void {
  db.exec("INSERT INTO segments_fts(segments_fts) VALUES('rebuild')");
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

export function corpusStats(db: DatabaseSync): {
  episodes: number;
  earliest: string | null;
  latest: string | null;
  segments: number;
  embeddings: { provider: string; model: string; dim: number; count: number }[];
} {
  const c = db.prepare("SELECT COUNT(*) n, MIN(date) lo, MAX(date) hi FROM episodes").get() as any;
  const seg = db.prepare("SELECT COUNT(*) n FROM segments").get() as any;
  let embeddings: any[] = [];
  try {
    embeddings = db
      .prepare(
        "SELECT provider, model, dim, COUNT(*) count FROM embeddings GROUP BY provider, model, dim"
      )
      .all() as any[];
  } catch {
    /* embeddings table may be empty/missing on older builds */
  }
  return { episodes: c.n, earliest: c.lo, latest: c.hi, segments: seg?.n ?? 0, embeddings };
}

// Build a safe FTS5 MATCH string from free text: quote each token, OR a prefix.
function ftsTerms(query: string, prefix = false): string {
  if (/["*]|\b(AND|OR|NOT|NEAR)\b/.test(query)) return query; // caller used FTS syntax
  const toks = query.match(/[\p{L}\p{N}]+/gu) || [];
  if (!toks.length) return '""';
  return toks.map((t) => (prefix ? `"${t}"*` : `"${t}"`)).join(" ");
}

export interface SegmentHit {
  episode: number;
  date: string | null;
  section: string | null;
  timestamp: string | null;
  speaker: string;
  snippet: string;
  text: string;
  score: number;
}

// Segment-level full-text search: returns the moment, with timecode + speaker.
export function searchSegments(
  db: DatabaseSync,
  query: string,
  opts: { limit?: number; episode?: number; speaker?: string; year?: string } = {}
): SegmentHit[] {
  const { limit = 10, episode, speaker, year } = opts;
  const filters: string[] = ["segments_fts MATCH ?"];
  const params: any[] = [ftsTerms(query)];
  if (episode != null) {
    filters.push("s.episode = ?");
    params.push(episode);
  }
  if (speaker) {
    filters.push("s.speaker = ? COLLATE NOCASE");
    params.push(speaker);
  }
  if (year) {
    filters.push("substr(s.date,1,4) = ?");
    params.push(year);
  }
  const sql = `
    SELECT s.episode AS episode, s.date AS date, s.section AS section,
           s.timestamp AS timestamp, s.speaker AS speaker, s.text AS text,
           snippet(segments_fts, 0, '[[', ']]', ' … ', 18) AS snippet,
           bm25(segments_fts) AS score
    FROM segments_fts f JOIN segments s ON s.id = f.rowid
    WHERE ${filters.join(" AND ")}
    ORDER BY score
    LIMIT ?`;
  params.push(limit);
  return db.prepare(sql).all(...params) as any[];
}

export interface MentionCount {
  term: string;
  totalOccurrences: number;
  segmentsMatched: number;
  episodesMatched: number;
  byYear: { year: string; occurrences: number; episodes: number }[];
  bySpeaker: { speaker: string; occurrences: number }[];
  topEpisodes: { episode: number; date: string | null; occurrences: number }[];
}

// Count true occurrences of a term across the archive, grouped. Narrows to
// candidate segments with FTS (prefix match), then counts real occurrences in
// each segment's text via the supplied counter (word-boundary, prefix-aware).
export function countMentions(
  db: DatabaseSync,
  term: string,
  countInText: (text: string, term: string) => number,
  opts: { topEpisodes?: number } = {}
): MentionCount {
  const rows = db
    .prepare(
      `SELECT s.episode AS episode, s.date AS date, s.speaker AS speaker, s.text AS text
       FROM segments_fts f JOIN segments s ON s.id = f.rowid
       WHERE segments_fts MATCH ?`
    )
    .all(ftsTerms(term, true)) as any[];

  let total = 0;
  const eps = new Map<number, { date: string | null; occ: number }>();
  const years = new Map<string, { occ: number; eps: Set<number> }>();
  const speakers = new Map<string, number>();

  for (const r of rows) {
    const n = countInText(r.text || "", term);
    if (n <= 0) continue;
    total += n;
    const e = eps.get(r.episode) || { date: r.date, occ: 0 };
    e.occ += n;
    eps.set(r.episode, e);
    const yr = (r.date || "").slice(0, 4) || "unknown";
    const y = years.get(yr) || { occ: 0, eps: new Set<number>() };
    y.occ += n;
    y.eps.add(r.episode);
    years.set(yr, y);
    speakers.set(r.speaker, (speakers.get(r.speaker) || 0) + n);
  }

  return {
    term,
    totalOccurrences: total,
    segmentsMatched: rows.length,
    episodesMatched: eps.size,
    byYear: [...years.entries()]
      .map(([year, v]) => ({ year, occurrences: v.occ, episodes: v.eps.size }))
      .sort((a, b) => a.year.localeCompare(b.year)),
    bySpeaker: [...speakers.entries()]
      .map(([speaker, occurrences]) => ({ speaker, occurrences }))
      .sort((a, b) => b.occurrences - a.occurrences),
    topEpisodes: [...eps.entries()]
      .map(([episode, v]) => ({ episode, date: v.date, occurrences: v.occ }))
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, opts.topEpisodes ?? 10),
  };
}

// ---- Embedding storage (episode-level vectors) ----------------------------
export function upsertEmbedding(
  db: DatabaseSync,
  episode: number,
  provider: string,
  model: string,
  vector: Float32Array
): void {
  const buf = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
  db.prepare(
    `INSERT INTO embeddings (episode, provider, model, dim, vector) VALUES (?,?,?,?,?)
     ON CONFLICT(episode, provider) DO UPDATE SET model=excluded.model, dim=excluded.dim, vector=excluded.vector`
  ).run(episode, provider, model, vector.length, buf);
}

export interface StoredEmbedding {
  episode: number;
  vector: Float32Array;
}

// Rank episodes by cosine similarity to a query vector (vectors are stored
// unit-normalized, so cosine == dot product).
export function semanticEpisodes(
  db: DatabaseSync,
  provider: string,
  query: Float32Array,
  limit: number
): { episode: number; score: number }[] {
  const docs = getEmbeddings(db, provider);
  const scored = docs.map((d) => {
    let s = 0;
    const n = Math.min(query.length, d.vector.length);
    for (let i = 0; i < n; i++) s += query[i] * d.vector[i];
    return { episode: d.episode, score: s };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export function getEmbeddings(db: DatabaseSync, provider: string): StoredEmbedding[] {
  const rows = db
    .prepare("SELECT episode, vector FROM embeddings WHERE provider = ?")
    .all(provider) as any[];
  return rows.map((r) => {
    const b: Buffer = r.vector;
    return {
      episode: r.episode,
      vector: new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4),
    };
  });
}

export function episodesForEmbedding(
  db: DatabaseSync
): { episode: number; title: string; date: string | null; text: string }[] {
  // Embed a compact, high-signal representation per episode: title + theme +
  // news-item titles. Keeps vectors cheap and semantically focused.
  const rows = db.prepare("SELECT episode, title, theme, news_json FROM episodes ORDER BY episode").all() as any[];
  return rows.map((r) => {
    const news = JSON.parse(r.news_json || "[]")
      .map((n: any) => n.title)
      .join("; ");
    const text = [r.title, r.theme, news].filter(Boolean).join(". ");
    return { episode: r.episode, title: r.title, date: null, text };
  });
}
