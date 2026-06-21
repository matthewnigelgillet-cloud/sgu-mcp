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
  apiKey: $("api-key"),
  model: $("model"),
  question: $("ai-question"),
  askBtn: $("ask-btn"),
  aiAnswer: $("ai-answer"),
  canvas: $("record-canvas"),
  tip: $("record-tip"),
  axis: $("record-axis"),
};

// ---- Mode tabs: switch the visible input (Search / Meaning / Ask) ----------
const tabs = [...document.querySelectorAll(".mode-tab")];
tabs.forEach((tab) =>
  tab.addEventListener("click", () => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", on ? "true" : "false");
      const panel = $(t.dataset.panel);
      panel.classList.toggle("active", on);
      panel.hidden = !on;
    });
    const focusId = { "panel-search": "q", "panel-meaning": "sem-q", "panel-ask": "api-key" }[tab.dataset.panel];
    $(focusId)?.focus();
  })
);

let db = null;
let lastResults = []; // top results from the most recent search, for the AI panel

// ---- The Record: a 20-year emission spectrum, ticks colored by time --------
// Older episodes are drawn redshifted (long wavelength), newer ones blueshifted.
// On a search, matching episodes flare to full brightness — you read a topic's
// coverage across two decades as bright lines against the faint archive.
const Spectrum = {
  eps: [], // { episode, t, year }
  min: 0,
  max: 1,
  matched: null, // Set<episode> | null
  pad: 10,
  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.addEventListener("resize", () => this.resize());
    canvas.addEventListener("pointermove", (e) => this.hover(e));
    canvas.addEventListener("pointerleave", () => (els.tip.style.opacity = 0));
    canvas.addEventListener("pointerdown", (e) => this.click(e));
  },
  setEpisodes(rows) {
    this.eps = rows
      .map((r) => ({ episode: r.episode, t: Date.parse(r.d), year: String(r.d).slice(0, 4) }))
      .filter((e) => !Number.isNaN(e.t));
    this.min = Math.min(...this.eps.map((e) => e.t));
    this.max = Math.max(...this.eps.map((e) => e.t));
    this.renderAxis();
    this.resize();
  },
  // Map a 0..1 position (0 = oldest) to a visible wavelength, then to RGB.
  // 0 -> 645nm (red), 1 -> 415nm (violet): the redshift gradient.
  color(p) {
    const nm = 645 - p * (645 - 415);
    let r = 0, g = 0, b = 0;
    if (nm < 440) { r = -(nm - 440) / (440 - 380); b = 1; }
    else if (nm < 490) { g = (nm - 440) / (490 - 440); b = 1; }
    else if (nm < 510) { g = 1; b = -(nm - 510) / (510 - 490); }
    else if (nm < 580) { r = (nm - 510) / (580 - 510); g = 1; }
    else if (nm < 645) { r = 1; g = -(nm - 645) / (645 - 580); }
    else { r = 1; }
    return [Math.round(255 * r), Math.round(255 * g), Math.round(255 * b)];
  },
  x(t) {
    const W = this.canvas.clientWidth;
    return this.pad + ((t - this.min) / (this.max - this.min || 1)) * (W - 2 * this.pad);
  },
  resize() {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    this.canvas.width = W * dpr;
    this.canvas.height = H * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  },
  render(matched, activeYear) {
    this.matched = matched && matched.size ? matched : null;
    this.activeYear = activeYear || "";
    this.draw();
  },
  draw() {
    const ctx = this.ctx;
    if (!ctx || !this.eps.length) return;
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    ctx.clearRect(0, 0, W, H);
    const baseY = H - 2;
    const span = this.max - this.min || 1;

    for (const e of this.eps) {
      const p = (e.t - this.min) / span;
      const [r, g, b] = this.color(p);
      const x = this.x(e.t);
      const hit = this.matched ? this.matched.has(e.episode) : null;
      const dimYear = this.activeYear && e.year !== this.activeYear;
      let alpha, h;
      if (this.matched) {
        alpha = hit ? (dimYear ? 0.5 : 1) : 0.06;
        h = hit ? H - 8 : 9;
      } else {
        alpha = 0.22;
        h = 12;
      }
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = `rgb(${r},${g},${b})`;
      ctx.lineWidth = this.matched && hit ? 1.6 : 1;
      if (this.matched && hit) {
        ctx.shadowColor = `rgb(${r},${g},${b})`;
        ctx.shadowBlur = 6;
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.lineTo(x, baseY - h);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  },
  renderAxis() {
    const years = [...new Set(this.eps.map((e) => e.year))].sort();
    if (!years.length) return;
    const step = Math.ceil(years.length / 8);
    const ticks = years.filter((_, i) => i % step === 0);
    els.axis.innerHTML = ticks.map((y) => `<span>${y}</span>`).join("");
  },
  nearest(clientX) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    let best = null, bd = 1e9;
    for (const e of this.eps) {
      const d = Math.abs(this.x(e.t) - mx);
      if (d < bd) { bd = d; best = e; }
    }
    return bd < 8 ? best : null;
  },
  hover(e) {
    const ep = this.nearest(e.clientX);
    if (!ep) { els.tip.style.opacity = 0; return; }
    const rect = this.canvas.getBoundingClientRect();
    els.tip.textContent = `EP ${ep.episode} · ${new Date(ep.t).toISOString().slice(0, 10)}`;
    els.tip.style.left = `${this.x(ep.t)}px`;
    els.tip.style.top = `${e.clientY - rect.top}px`;
    els.tip.style.opacity = 1;
  },
  click(e) {
    const ep = this.nearest(e.clientX);
    if (!ep) return;
    els.year.value = els.year.value === ep.year ? "" : ep.year;
    runSearch();
  },
};

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
    const days = Math.round((Date.parse(stats.hi) - Date.parse(stats.lo)) / 86400000);
    els.stat.textContent =
      `${stats.n.toLocaleString()} EPISODES · ${days.toLocaleString()} DAYS ON AIR · ${String(stats.lo).slice(0, 4)}–${String(stats.hi).slice(0, 4)}`;

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

    // Load every episode's date for the spectrum, then draw the idle archive.
    Spectrum.init(els.canvas);
    const epRows = await db.query("SELECT episode, substr(date,1,10) d FROM episodes WHERE date IS NOT NULL");
    Spectrum.setEpisodes(epRows);
  } catch (e) {
    els.stat.textContent = "COULD NOT LOAD THE ARCHIVE";
    els.results.innerHTML = `<p class="empty">Can't read the archive: ${escapeHtml(e.message)}<br>The database loads over HTTP byte-range requests — the host needs to allow them.</p>`;
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
    els.results.innerHTML = "";
    Spectrum.render(null); // back to the idle archive
    return;
  }
  els.results.innerHTML = `<p class="loading">Reading the record…</p>`;

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

  // Every matching episode (not just the top 50) lights up the spectrum.
  const all = await db.query(
    "SELECT episode FROM episodes_fts WHERE episodes_fts MATCH :m",
    { ":m": match }
  );
  Spectrum.render(new Set(all.map((r) => r.episode)), year);

  renderSummary(rawQuery, total, byYear, year);
  renderResults(rows, year);
  lastResults = rows.slice(0, 12);
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
  const q = escapeHtml(query);
  let headline;
  if (activeYear) {
    const yearN = byYear.find((r) => r.yr === activeYear)?.n || 0;
    headline = `<strong>${q}</strong> — in <span class="count">${yearN}</span> episode${yearN === 1 ? "" : "s"} in ${activeYear} <span class="muted">(${total} across all years)</span>`;
  } else {
    headline = `<strong>${q}</strong> — in <span class="count">${total}</span> episode${total === 1 ? "" : "s"}, ${byYear[byYear.length - 1].yr}–${byYear[0].yr} <span class="muted">· tap a year to narrow</span>`;
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
    els.results.innerHTML = `<p class="empty">Nothing in the record${year ? " for " + year : ""}. Try fewer or different terms.</p>`;
    return;
  }
  els.results.innerHTML =
    `<p class="results-lead">Top matches</p>` +
    rows
      .map((r) => {
        const date = r.date ? String(r.date).slice(0, 10) : "";
        const links = [
          r.url ? `<a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">transcript</a>` : "",
          r.audio ? `<a href="${escapeHtml(r.audio)}" target="_blank" rel="noopener">audio</a>` : "",
        ].filter(Boolean).join(" · ");
        const theme = r.theme ? ` <span class="theme">— ${escapeHtml(r.theme)}</span>` : "";
        return `<article class="result" data-date="${date}">
          <div class="id">EP ${String(r.episode).padStart(4, "0")}</div>
          <h3><a href="${escapeHtml(r.url || "#")}" target="_blank" rel="noopener">Episode ${r.episode}${theme}</a></h3>
          <div class="meta">${date}${links ? " · " + links : ""}</div>
          <div class="snippet">${r.snippet || ""}</div>
        </article>`;
      })
      .join("");
  // Tint each result's edge by its redshift color (set via CSSOM — CSP-safe).
  els.results.querySelectorAll(".result").forEach((el) => {
    const t = Date.parse(el.dataset.date);
    if (Number.isNaN(t) || !Spectrum.eps.length) return;
    const p = (t - Spectrum.min) / (Spectrum.max - Spectrum.min || 1);
    const [r, g, b] = Spectrum.color(p);
    el.style.setProperty("--rs", `rgb(${r},${g},${b})`);
  });
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

// ---- Semantic search: find episodes by meaning -----------------------------
// Doc vectors are shipped in the DB (one per episode). At query time we embed
// just the query — either in-browser (free, transformers.js) or via the
// visitor's own OpenAI key (best). Both compare against vectors made the same
// way (provider column), so the spaces match.
const sem = {
  mode: $("sem-mode"),
  key: $("sem-openai-key"),
  q: $("sem-q"),
  btn: $("sem-btn"),
  status: $("sem-status"),
};
const vecCache = {}; // provider -> [{episode,title,date,theme,vec:Float32Array}]
let localExtractor = null;

sem.key.value = localStorage.getItem("sgu_openai_key") || "";
sem.mode.addEventListener("change", () => {
  sem.key.hidden = sem.mode.value !== "openai";
});
sem.btn.addEventListener("click", () => runSemantic().catch((e) => semStatus(`Error: ${e.message}`, true)));
sem.q.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sem.btn.click();
});

function semStatus(msg, isErr) {
  sem.status.hidden = !msg;
  sem.status.textContent = msg || "";
  sem.status.style.color = isErr ? "var(--err, #c00)" : "";
}

function bytesToFloat32(u8) {
  // sql.js returns BLOBs as Uint8Array; reinterpret as little-endian Float32.
  const b = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  return new Float32Array(b);
}

async function loadVectors(provider) {
  if (vecCache[provider]) return vecCache[provider];
  const rows = await db.query(
    `SELECT e.episode AS episode, e.title AS title, e.date AS date, e.theme AS theme, m.vector AS vector
     FROM embeddings m JOIN episodes e ON e.episode = m.episode
     WHERE m.provider = :p`,
    { ":p": provider }
  );
  if (!rows.length) return null;
  vecCache[provider] = rows.map((r) => ({
    episode: r.episode,
    title: r.title,
    date: r.date,
    theme: r.theme,
    vec: bytesToFloat32(r.vector),
  }));
  return vecCache[provider];
}

function normalize(v) {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

async function embedLocal(text) {
  if (!localExtractor) {
    semStatus("Loading the language model (one-time, ~25 MB)…");
    const { pipeline, env } = await import("https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2");
    env.allowLocalModels = false;
    localExtractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  const out = await localExtractor(text, { pooling: "mean", normalize: true });
  return normalize(Float32Array.from(out.data));
}

async function embedOpenAI(text, key) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${data?.error?.message || "request failed"}`);
  return normalize(Float32Array.from(data.data[0].embedding));
}

async function runSemantic() {
  const query = sem.q.value.trim();
  if (!query) return semStatus("Type what you're looking for first.", true);
  const provider = sem.mode.value;

  const vectors = await loadVectors(provider);
  if (!vectors) {
    semStatus(
      provider === "openai"
        ? "This archive doesn't have OpenAI embeddings published — the site owner can add them with `EMBED_PROVIDER=openai npm run embed`. Try the Free mode."
        : "No embeddings found in this archive.",
      true
    );
    return;
  }

  let qvec;
  if (provider === "openai") {
    const key = sem.key.value.trim();
    if (!key) return semStatus("Enter your OpenAI key for ‘Best’ mode, or switch to Free.", true);
    localStorage.setItem("sgu_openai_key", key);
    semStatus("Embedding your query via OpenAI…");
    qvec = await embedOpenAI(query, key);
  } else {
    qvec = await embedLocal(query);
  }

  semStatus("Ranking episodes…");
  const scored = vectors
    .map((d) => {
      let s = 0;
      const n = Math.min(qvec.length, d.vec.length);
      for (let i = 0; i < n; i++) s += qvec[i] * d.vec[i];
      return { ...d, score: s };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  semStatus("");
  els.summary.hidden = true;
  Spectrum.render(new Set(scored.map((r) => r.episode))); // light up the matches
  els.results.innerHTML =
    `<p class="results-lead">Closest by meaning — “${escapeHtml(query)}”</p>` +
    scored
      .map((r) => {
        const date = r.date ? String(r.date).slice(0, 10) : "";
        const url = `https://www.sgutranscripts.org/wiki/SGU_Episode_${r.episode}`;
        const theme = r.theme ? ` <span class="theme">— ${escapeHtml(r.theme)}</span>` : "";
        return `<article class="result" data-date="${date}">
          <div class="id">EP ${String(r.episode).padStart(4, "0")} · ${(r.score * 100).toFixed(0)}% match</div>
          <h3><a href="${url}" target="_blank" rel="noopener">Episode ${r.episode}${theme}</a></h3>
          <div class="meta">${date}</div>
        </article>`;
      })
      .join("");
  els.results.querySelectorAll(".result").forEach((el) => {
    const t = Date.parse(el.dataset.date);
    if (Number.isNaN(t) || !Spectrum.eps.length) return;
    const p = (t - Spectrum.min) / (Spectrum.max - Spectrum.min || 1);
    const [r, g, b] = Spectrum.color(p);
    el.style.setProperty("--rs", `rgb(${r},${g},${b})`);
  });
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
