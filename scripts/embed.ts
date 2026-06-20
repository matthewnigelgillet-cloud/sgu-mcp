// Generate episode-level embeddings for semantic search and store them in the DB.
//   npm run embed                 # local model (default, no key)
//   EMBED_PROVIDER=openai npm run embed   # needs OPENAI_API_KEY (one-time ~cents)
//   EMBED_PROVIDER=voyage npm run embed   # needs VOYAGE_API_KEY
//
// Doc vectors are computed once. The website ships them so visitors get semantic
// search for free (local mode) or with their own key (openai mode) — you never
// pay per query. Run this after `npm run index`.
import { openDb, episodesForEmbedding, upsertEmbedding, corpusStats } from "../src/db.js";
import { getEmbedder, providerFromEnv } from "../src/embeddings.js";

async function main() {
  const provider = providerFromEnv();
  const db = openDb(undefined, { create: true }); // writable
  const eps = episodesForEmbedding(db);
  if (!eps.length) {
    console.error("No episodes indexed. Run `npm run index` first.");
    process.exit(1);
  }

  console.error(`Embedding ${eps.length} episodes with provider '${provider}'…`);
  const embedder = await getEmbedder(provider);
  console.error(`Model: ${embedder.model} (${embedder.dim}d)`);

  const BATCH = 64;
  let done = 0;
  db.exec("BEGIN");
  for (let i = 0; i < eps.length; i += BATCH) {
    const slice = eps.slice(i, i + BATCH);
    const vecs = await embedder.embed(slice.map((e) => e.text || e.title));
    slice.forEach((e, j) => upsertEmbedding(db, e.episode, provider, embedder.model, vecs[j]));
    done += slice.length;
    if (done % 256 === 0 || done === eps.length) console.error(`  ${done}/${eps.length}`);
  }
  db.exec("COMMIT");

  const stats = corpusStats(db);
  console.error(`\nDone. Embeddings in DB:`, stats.embeddings);
  db.close();
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
