// SGU Archive — fully client-side search over the episode FTS5 database,
// served as a static file and queried in-browser via sql.js-httpvfs (SQLite
// compiled to WASM, fetching only the DB pages each query touches over HTTP
// range requests). No backend. The optional "Ask Claude" panel calls the
// Anthropic API directly from the browser with the visitor's own key.
// Vendored locally (web/vendor/) — browsers block cross-origin Worker scripts,
// so the worker + wasm must be same-origin. sql.js-httpvfs ships as a UMD bundle
// loaded via a classic <script> in index.html, which attaches createDbWorker to
// window. Absolute URLs so the worker resolves the wasm path correctly.
const { createDbWorker } = window;

const WORKER_URL = new URL("./vendor/sqlite.worker.js", import.meta.url).href;
const WASM_URL = new URL("./vendor/sql-wasm.wasm", import.meta.url).href;
// Absolute — the worker resolves the DB url relative to itself (in /vendor/),
// so a bare "./sgu.db" would 404.
const DB_URL = new URL("./sgu.db", import.meta.url).href;

const $ = (id) => document.getElementById(id);
const els = {
  stat: $("stat-line"),
  form: $("search-form"),
  q: $("q"),
  year: $("year"),
  summary: $("summary"),
  results: $("results"),
  aiPanel: $("ai-panel"),
  apiKey: $("api-key"),
  model: $("model"),
  question: $("ai-question"),
  askBtn: $("ask-btn"),
  aiAnswer: $("ai-answer"),
};

let db = null;
let lastResults = []; // top results from the most recent search, for the AI panel

async function init() {
  try {
    const worker = await createDbWorker(
      [{ from: "inline", config: { serverMode: "full", url: DB_URL, requestChunkSize: 4096 } }],
      WORKER_URL,
      WASM_URL
    );
    db = worker.db;
    const stats = (await db.query(
      "SELECT COUNT(*) n, MIN(date) lo, MAX(date) hi FROM episodes"
    ))[0];
    els.stat.textContent = `${stats.n.toLocaleString()} episodes, ${String(stats.lo).slice(0, 4)}–${String(stats.hi).slice(0, 4)}.`;

    // populate year filter from data
    const years = await db.query(
      "SELECT DISTINCT substr(date,1,4) y FROM episodes WHERE date IS NOT NULL ORDER BY y DESC"
    );
    for (const { y } of years) {
      if (!y) continue;
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      els.year.appendChild(opt);
    }
  } catch (e) {
    els.stat.textContent = "could not load the archive.";
    els.results.innerHTML = `<p class="empty">Failed to load the search index: ${escapeHtml(e.message)}<br>The database file must be served with HTTP range-request support.</p>`;
    console.error(e);
  }
}

// Restore a saved API key + model.
els.apiKey.value = localStorage.getItem("sgu_anthropic_key") || "";
els.model.value = localStorage.getItem("sgu_model") || "claude-haiku-4-5";

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// FTS query escaping: if the user didn't use operators/quotes, treat the input
// as a phrase-ish bag of terms so stray punctuation can't break the parser.
function ftsQuery(raw) {
  const q = raw.trim();
  if (/["*]|(\b(AND|OR|NOT|NEAR)\b)/.test(q)) return q; // user is using FTS syntax
  // quote each bareword token to be safe, AND them together
  const toks = q.match(/[\p{L}\p{N}]+/gu) || [];
  if (!toks.length) return null;
  return toks.map((t) => `"${t}"`).join(" ");
}

async function search(rawQuery, year) {
  const match = ftsQuery(rawQuery);
  if (!match) {
    els.summary.hidden = true;
    els.aiPanel.hidden = true;
    els.results.innerHTML = "";
    return;
  }
  els.results.innerHTML = `<p class="loading">Searching…</p>`;

  const yearClause = year ? " AND e.date LIKE :yr" : "";
  const params = { ":m": match };
  if (year) params[":yr"] = year + "%";

  // Ranked results with a highlighted transcript snippet.
  const rows = await db.query(
    `SELECT f.episode AS episode, e.title AS title, e.date AS date, e.theme AS theme,
            e.transcript_url AS url, e.audio_url AS audio,
            snippet(episodes_fts, 3, '<mark>', '</mark>', ' … ', 16) AS snippet,
            bm25(episodes_fts, 0.0, 8.0, 4.0, 1.0) AS score
     FROM episodes_fts f JOIN episodes e ON e.episode = f.episode
     WHERE episodes_fts MATCH :m${yearClause}
     ORDER BY score LIMIT 50`,
    params
  );

  // Counts: total episodes + per-year breakdown (the "how many times in 2024" answer).
  const byYear = await db.query(
    `SELECT substr(e.date,1,4) AS yr, COUNT(*) AS n
     FROM episodes_fts f JOIN episodes e ON e.episode = f.episode
     WHERE episodes_fts MATCH :m
     GROUP BY yr ORDER BY yr DESC`,
    { ":m": match }
  );
  const total = byYear.reduce((a, r) => a + r.n, 0);

  renderSummary(rawQuery, total, byYear, year);
  renderResults(rows, year);

  lastResults = rows.slice(0, 12);
  els.aiPanel.hidden = rows.length === 0;
}

function renderSummary(query, total, byYear, activeYear) {
  if (total === 0) {
    els.summary.hidden = true;
    return;
  }
  const yearBars = byYear
    .filter((r) => r.yr)
    .map(
      (r) =>
        `<button class="year-bar${activeYear === r.yr ? " active" : ""}" data-year="${r.yr}">${r.yr} <b>${r.n}</b></button>`
    )
    .join("");
  let headline;
  if (activeYear) {
    const yearN = byYear.find((r) => r.yr === activeYear)?.n || 0;
    headline = `“<strong>${escapeHtml(query)}</strong>” appears in <strong>${yearN}</strong> episode${yearN === 1 ? "" : "s"} in <strong>${activeYear}</strong> <span style="color:var(--muted)">(${total} across all years)</span>.`;
  } else {
    headline = `“<strong>${escapeHtml(query)}</strong>” appears in <strong>${total}</strong> episode${total === 1 ? "" : "s"} <span style="color:var(--muted)">— pick a year to narrow down</span>.`;
  }
  els.summary.innerHTML = `<div class="big">${headline}</div><div class="year-bars">${yearBars}</div>`;
  els.summary.hidden = false;
  els.summary.querySelectorAll(".year-bar").forEach((b) =>
    b.addEventListener("click", () => {
      const y = b.dataset.year;
      els.year.value = els.year.value === y ? "" : y;
      runSearch();
    })
  );
}

function renderResults(rows, year) {
  if (!rows.length) {
    els.results.innerHTML = `<p class="empty">No episodes matched${year ? " in " + year : ""}. Try fewer or different terms.</p>`;
    return;
  }
  els.results.innerHTML = rows
    .map((r) => {
      const date = r.date ? String(r.date).slice(0, 10) : "";
      const links = [
        r.url ? `<a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">transcript</a>` : "",
        r.audio ? `<a href="${escapeHtml(r.audio)}" target="_blank" rel="noopener">audio</a>` : "",
      ].filter(Boolean).join(" · ");
      return `<article class="result">
        <h3><a href="${escapeHtml(r.url || "#")}" target="_blank" rel="noopener">Episode ${r.episode}${r.theme ? ` — <span style="color:var(--muted);font-weight:400">${escapeHtml(r.theme)}</span>` : ""}</a></h3>
        <div class="meta">${date}${links ? " · " + links : ""}</div>
        <div class="snippet">${r.snippet || ""}</div>
      </article>`;
    })
    .join("");
}

function runSearch() {
  search(els.q.value, els.year.value).catch((e) => {
    els.results.innerHTML = `<p class="empty">Search error: ${escapeHtml(e.message)}</p>`;
    console.error(e);
  });
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  runSearch();
});
els.year.addEventListener("change", runSearch);

// ---- BYOK: ask Claude using the top results --------------------------------
els.askBtn.addEventListener("click", askClaude);

async function askClaude() {
  const key = els.apiKey.value.trim();
  if (!key) {
    showAnswer("Enter your Anthropic API key first.", true);
    return;
  }
  if (!lastResults.length) {
    showAnswer("Run a search first — Claude answers from the top results.", true);
    return;
  }
  localStorage.setItem("sgu_anthropic_key", key);
  localStorage.setItem("sgu_model", els.model.value);

  const question = els.question.value.trim() ||
    `Summarise what The Skeptics' Guide to the Universe has said about "${els.q.value.trim()}".`;

  // Build grounded context from the top results' snippets.
  const context = lastResults
    .map((r) => `[Episode ${r.episode}${r.date ? ", " + String(r.date).slice(0, 10) : ""}] ${stripTags(r.snippet)}`)
    .join("\n\n");

  const system =
    "You are answering questions about the podcast The Skeptics' Guide to the Universe using ONLY the transcript excerpts provided by the user. " +
    "Cite the episode number(s) you draw from, like (ep 1075). If the excerpts don't contain the answer, say so plainly rather than guessing. Be concise.";

  els.askBtn.disabled = true;
  showAnswer("Thinking…", false);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: els.model.value,
        max_tokens: 1024,
        system,
        messages: [
          { role: "user", content: `Transcript excerpts:\n\n${context}\n\n---\nQuestion: ${question}` },
        ],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showAnswer(`API error (${res.status}): ${data?.error?.message || "unknown"}`, true);
      return;
    }
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    showAnswer(text || "(no text returned)", false);
  } catch (e) {
    showAnswer(`Request failed: ${e.message}`, true);
  } finally {
    els.askBtn.disabled = false;
  }
}

function stripTags(s) {
  return String(s || "").replace(/<[^>]+>/g, "");
}
function showAnswer(text, isErr) {
  els.aiAnswer.hidden = false;
  els.aiAnswer.className = isErr ? "err" : "";
  els.aiAnswer.textContent = text;
}

init();
