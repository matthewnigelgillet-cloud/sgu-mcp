// Build data/sgu.db (SQLite FTS5) from the episodes/*.md corpus.
// Rebuildable any time without re-scraping.
//   npm run index
import { readdir, readFile, mkdir, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, initSchema, upsertEpisode, corpusStats, DB_PATH } from "../src/db.js";
import type { Frontmatter } from "../src/markdown.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const EP_DIR = join(ROOT, "episodes");

// Minimal YAML frontmatter reader for the shapes markdown.ts emits.
function parseFrontmatter(md: string): { fm: any; body: string } {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: md };
  const fm: any = {};
  const lines = m[1].split("\n");
  let key: string | null = null;
  let arr: any[] | null = null;
  let objItem: any | null = null;
  const scalar = (v: string): any => {
    v = v.trim();
    if (v === "null" || v === "") return null;
    if (v === "true") return true;
    if (v === "false") return false;
    if (/^-?\d+$/.test(v)) return Number(v);
    if (v.startsWith('"')) try { return JSON.parse(v); } catch { return v; }
    return v;
  };
  for (const line of lines) {
    if (/^[a-z_]+:/.test(line)) {
      const idx = line.indexOf(":");
      key = line.slice(0, idx);
      const rest = line.slice(idx + 1).trim();
      objItem = null;
      if (rest === "" ) { arr = []; fm[key] = arr; }
      else if (rest === "[]") { fm[key] = []; arr = null; }
      else { fm[key] = scalar(rest); arr = null; }
    } else if (arr && /^\s+-\s/.test(line)) {
      const content = line.replace(/^\s+-\s/, "");
      if (content.includes(":")) {
        const ci = content.indexOf(":");
        objItem = { [content.slice(0, ci).trim()]: scalar(content.slice(ci + 1)) };
        arr.push(objItem);
      } else {
        arr.push(scalar(content));
      }
    } else if (arr && objItem && /^\s+[a-z_]+:/.test(line)) {
      const ci = line.indexOf(":");
      objItem[line.slice(0, ci).trim()] = scalar(line.slice(ci + 1));
    }
  }
  return { fm, body: m[2] };
}

function fmToFrontmatter(fm: any, path: string): Frontmatter {
  return {
    episode: fm.episode,
    title: fm.title ?? `SGU #${fm.episode}`,
    date: fm.date ?? null,
    rogues: fm.rogues ?? [],
    guests: fm.guests ?? [],
    theme: fm.theme ?? null,
    sof_fiction_item: fm.sof_fiction_item ?? null,
    sof_answer_known: !!fm.sof_answer_known,
    quote_of_the_week: fm.quote_of_the_week ?? null,
    quote_author: fm.quote_author ?? null,
    news_items: fm.news_items ?? [],
    audio_url: fm.audio_url ?? null,
    duration_seconds: fm.duration_seconds ?? null,
    transcript_url: fm.transcript_url ?? "",
    source: fm.source ?? "sgutranscripts.org",
  };
}

async function main() {
  await mkdir(dirname(DB_PATH), { recursive: true });
  // rebuild from scratch
  await rm(DB_PATH, { force: true });
  await rm(DB_PATH + "-wal", { force: true });
  await rm(DB_PATH + "-shm", { force: true });

  const db = openDb(DB_PATH, { create: true });
  initSchema(db);

  const files = (await readdir(EP_DIR)).filter((f) => f.endsWith(".md")).sort();
  console.error(`Indexing ${files.length} episodes…`);
  let n = 0;
  db.exec("BEGIN");
  for (const f of files) {
    const md = await readFile(join(EP_DIR, f), "utf8");
    const { fm, body } = parseFrontmatter(md);
    if (!fm.episode) continue;
    const frontmatter = fmToFrontmatter(fm, `episodes/${f}`);
    upsertEpisode(db, { fm: frontmatter, path: `episodes/${f}`, transcript: body });
    if (++n % 100 === 0) console.error(`  ${n}/${files.length}`);
  }
  db.exec("COMMIT");

  const stats = corpusStats(db);
  console.error(`\nIndexed ${stats.episodes} episodes. Range: ${stats.earliest ?? "?"} → ${stats.latest ?? "?"}`);
  db.close();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
