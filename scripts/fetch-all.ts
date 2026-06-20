// Bulk-scrape every SGU episode transcript from sgutranscripts.org into
// episodes/NNNN.md (YAML frontmatter + clean markdown).
//
// Polite & resumable: limited concurrency, skips files that already exist
// (unless --force), retries transient failures.
//
// Usage:
//   npm run fetch                 # scrape all missing episodes
//   npx tsx scripts/fetch-all.ts --force            # re-scrape everything
//   npx tsx scripts/fetch-all.ts --only 1075,1074   # specific episodes
import { mkdir, writeFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as wiki from "../src/wiki.js";
import { getFeed } from "../src/rss.js";
import { buildMarkdown } from "../src/markdown.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const EP_DIR = join(ROOT, "episodes");
const API = "https://www.sgutranscripts.org/w/api.php";
const UA = "sgu-mcp/0.1 (personal archive; contact via github)";
const CONCURRENCY = 4;
const GAP_MS = 120;

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const onlyArg = args[args.indexOf("--only") + 1];
const ONLY = args.includes("--only") && onlyArg ? onlyArg.split(",").map(Number) : null;

function pad(n: number): string {
  return String(n).padStart(4, "0");
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function listEpisodeNumbers(): Promise<number[]> {
  const nums = new Set<number>();
  let apcontinue: string | undefined;
  do {
    const u = new URL(API);
    u.search = new URLSearchParams({
      action: "query",
      list: "allpages",
      apprefix: "SGU Episode ",
      apnamespace: "0",
      aplimit: "500",
      format: "json",
      ...(apcontinue ? { apcontinue } : {}),
    }).toString();
    const j: any = await (await fetch(u, { headers: { "User-Agent": UA } })).json();
    for (const p of j.query.allpages) {
      const m = String(p.title).match(/^SGU Episode (\d+)$/);
      if (m) nums.add(Number(m[1]));
    }
    apcontinue = j.continue?.apcontinue;
  } while (apcontinue);
  return [...nums].sort((a, b) => a - b);
}

async function fetchWikitext(n: number, tries = 3): Promise<string | null> {
  const u = new URL(API);
  u.search = new URLSearchParams({
    action: "parse",
    page: `SGU Episode ${n}`,
    prop: "wikitext",
    redirects: "1",
    format: "json",
  }).toString();
  for (let t = 0; t < tries; t++) {
    try {
      const res = await fetch(u, { headers: { "User-Agent": UA } });
      if (res.status === 429 || res.status >= 500) {
        await sleep(1000 * (t + 1));
        continue;
      }
      const j: any = await res.json();
      if (j.error) return null; // missing page etc.
      return j?.parse?.wikitext?.["*"] ?? null;
    } catch {
      await sleep(500 * (t + 1));
    }
  }
  return null;
}

async function main() {
  await mkdir(EP_DIR, { recursive: true });
  const existing = new Set(
    (await readdir(EP_DIR).catch(() => [])).filter((f) => f.endsWith(".md")).map((f) => Number(f.replace(".md", "")))
  );

  console.error("Enumerating episode pages…");
  let numbers = ONLY ?? (await listEpisodeNumbers());
  if (!FORCE && !ONLY) numbers = numbers.filter((n) => !existing.has(n));
  console.error(`${numbers.length} episodes to fetch (concurrency ${CONCURRENCY}).`);

  // feed gives dates + audio for recent episodes
  const feed = await getFeed().catch(() => []);
  const feedByEp = new Map(feed.filter((f) => f.episode).map((f) => [f.episode!, f]));

  let done = 0,
    written = 0,
    empty = 0,
    failed = 0;
  const queue = [...numbers];

  async function worker(id: number) {
    while (queue.length) {
      const n = queue.shift();
      if (n === undefined) break;
      const wt = await fetchWikitext(n);
      done++;
      if (!wt || wt.trim().length < 200) {
        empty++;
      } else {
        try {
          const { markdown } = buildMarkdown({
            episode: n,
            wikitext: wt,
            transcriptUrl: wiki.pageUrl(`SGU Episode ${n}`),
            feed: feedByEp.get(n) ?? null,
          });
          await writeFile(join(EP_DIR, `${pad(n)}.md`), markdown, "utf8");
          written++;
        } catch (e: any) {
          failed++;
          console.error(`  ! ${n} build failed: ${e.message}`);
        }
      }
      if (done % 25 === 0 || queue.length === 0)
        console.error(`  ${done}/${numbers.length} (written ${written}, empty ${empty}, failed ${failed})`);
      await sleep(GAP_MS);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));
  console.error(`\nDone. written=${written} empty=${empty} failed=${failed} (of ${numbers.length})`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
