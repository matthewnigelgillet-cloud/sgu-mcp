// Live smoke test of the data layer against real SGU sources.
import * as wiki from "../src/wiki.js";
import * as rss from "../src/rss.js";
import { parseInfoBox, parseNewsItems, parseScienceOrFiction } from "../src/parse.js";

async function main() {
  console.log("== RSS latest ==");
  const latest = await rss.getLatest(3);
  for (const e of latest) console.log(`  #${e.episode} ${e.date?.slice(0, 10)} audio:${!!e.audioUrl}`);

  console.log("\n== search 'vaccine' ==");
  const hits = await wiki.search("vaccine", 3);
  for (const h of hits) console.log(`  [${h.episode}] ${h.title}`);

  console.log("\n== episode 1075 wiki parse ==");
  const page = await wiki.parsePage(wiki.episodePageTitle(1075));
  if (!page) throw new Error("1075 page missing");
  const info = parseInfoBox(page.wikitext);
  console.log("  rogues:", info.rogues.join(", "));
  console.log("  guests:", info.guests.join(", ") || "(none)");
  console.log("  caption:", info.caption);
  console.log("  qotw:", info.quoteOfTheWeek.text?.slice(0, 60), "—", info.quoteOfTheWeek.author);

  const news = parseNewsItems(page.wikitext);
  console.log(`\n  news items (${news.length}):`);
  for (const n of news) console.log(`    - ${n.title} [${n.timestamp}] ${n.link ?? "(no link)"}`);

  const sof = parseScienceOrFiction(page.wikitext);
  console.log(`\n  Science or Fiction theme=${sof?.theme} answerKnown=${sof?.answerKnown}`);
  for (const it of sof?.items ?? []) console.log(`    #${it.number} [${it.verdict ?? "?"}] ${it.text.slice(0, 70)}`);

  console.log("\nOK");
}
main().catch((e) => {
  console.error("SMOKE FAILED:", e);
  process.exit(1);
});
