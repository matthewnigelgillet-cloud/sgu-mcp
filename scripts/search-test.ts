import { openDb, searchCorpus, getEpisodeMeta, corpusStats } from "../src/db.js";
const db = openDb(undefined, { create: false });
console.log("stats:", JSON.stringify(corpusStats(db)));
for (const q of (process.argv.slice(2).length ? [process.argv.slice(2).join(" ")] : ["lava tube Venus", "ADHD treatment", "figure skating"])) {
  const r = searchCorpus(db, q, 3);
  console.log(`\nQ: ${q}`);
  for (const h of r) console.log(`  #${h.episode} score=${h.score.toFixed(2)} :: ${h.snippet.replace(/\s+/g, " ").slice(0, 100)}`);
}
const m = getEpisodeMeta(db, 1075);
console.log("\nmeta 1075: theme=", m.theme, "| fiction item=", m.sof_fiction_item, "| rogues=", m.rogues.join(","));
