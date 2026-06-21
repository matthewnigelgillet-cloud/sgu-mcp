// In-browser access to the real SGU index (the same FTS5 database the archive
// site uses), via sql.js-httpvfs — only the DB pages each query touches are
// fetched over HTTP range requests. The UMD bundle (public/vendor/index.js)
// attaches `createDbWorker` to window. No backend.

let _ready = null;
let _db = null;

export function initArchive() {
  if (_ready) return _ready;
  _ready = (async () => {
    const createDbWorker = window.createDbWorker;
    if (!createDbWorker) throw new Error("search engine failed to load (vendor/index.js missing)");
    // The DB is fetched in full mode with HTTP range requests. Set VITE_DB_URL
    // (in Cloudflare Pages env vars) to a fast, range-capable, CORS-enabled host
    // — e.g. the Render static site that serves /sgu.db. If unset, it falls back
    // to the same-origin /db Pages Function (which proxies the GitHub release —
    // correct but slow), so always set VITE_DB_URL in production.
    const dbUrl = import.meta.env.VITE_DB_URL || "/db";
    const worker = await createDbWorker(
      [{ from: "inline", config: { serverMode: "full", url: dbUrl, requestChunkSize: 262144 } }],
      "/vendor/sqlite.worker.js",
      "/vendor/sql-wasm.wasm"
    );
    _db = worker.db;
    return _db;
  })();
  return _ready;
}

// FTS escaping: if the user didn't use operators/quotes, quote each token and AND them.
function ftsQuery(raw) {
  const q = (raw || "").trim();
  if (!q) return null;
  if (/["*]|\b(AND|OR|NOT|NEAR)\b/.test(q)) return q;
  const toks = q.match(/[\p{L}\p{N}]+/gu) || [];
  if (!toks.length) return null;
  return toks.map((t) => `"${t}"`).join(" ");
}

export async function archiveStats() {
  const db = await initArchive();
  return (await db.query("SELECT COUNT(*) n, MIN(date) lo, MAX(date) hi FROM episodes"))[0];
}

/** Free keyword search → ranked episode records with a highlighted snippet. */
export async function searchEpisodes(raw, { year, limit = 40 } = {}) {
  const db = await initArchive();
  const m = ftsQuery(raw);
  if (!m) return { rows: [], total: 0, byYear: [] };

  const yearClause = year ? " AND e.date LIKE :yr" : "";
  const params = { ":m": m };
  if (year) params[":yr"] = year + "%";

  const rows = await db.query(
    `SELECT f.episode AS episode, e.title AS title, e.date AS date, e.theme AS theme,
            e.rogues AS rogues, e.transcript_url AS url, e.audio_url AS audio,
            snippet(episodes_fts, 3, '', '', ' … ', 16) AS snippet,
            bm25(episodes_fts, 0.0, 8.0, 4.0, 1.0) AS score
     FROM episodes_fts f JOIN episodes e ON e.episode = f.episode
     WHERE episodes_fts MATCH :m${yearClause}
     ORDER BY score LIMIT :lim`,
    { ...params, ":lim": limit }
  );

  const byYear = await db.query(
    `SELECT substr(e.date,1,4) AS yr, COUNT(*) AS n
     FROM episodes_fts f JOIN episodes e ON e.episode = f.episode
     WHERE episodes_fts MATCH :m GROUP BY yr ORDER BY yr`,
    { ":m": m }
  );
  const total = byYear.reduce((a, r) => a + r.n, 0);

  return {
    total,
    byYear: byYear.filter((r) => r.yr),
    rows: rows.map((r) => ({
      episode: r.episode,
      title: r.title,
      date: r.date,
      theme: r.theme,
      url: r.url,
      audio: r.audio,
      rogues: safeList(r.rogues),
      snippet: r.snippet || "",
    })),
  };
}

/** Retrieve grounding excerpts for the Claude reference desk (SGU-only RAG). */
export async function ragContext(raw, n = 10) {
  const db = await initArchive();
  const m = ftsQuery(raw);
  if (!m) return [];
  const rows = await db.query(
    `SELECT f.episode AS episode, e.date AS date,
            snippet(episodes_fts, 3, '«', '»',' … ', 48) AS text
     FROM episodes_fts f JOIN episodes e ON e.episode = f.episode
     WHERE episodes_fts MATCH :m
     ORDER BY bm25(episodes_fts, 0.0, 8.0, 4.0, 1.0) LIMIT :n`,
    { ":m": m, ":n": n }
  );
  return rows.map((r) => ({
    episode: r.episode,
    date: r.date ? String(r.date).slice(0, 10) : null,
    text: r.text || "",
  }));
}

function safeList(json) {
  try {
    const v = JSON.parse(json || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
