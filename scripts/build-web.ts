// Prepare the FTS database for static, range-request serving in the browser.
// Copies data/sgu.db -> web/sgu.db, checkpoints the WAL into the main file,
// switches to a single-file (DELETE) journal, and VACUUMs so sql.js-httpvfs
// can fetch clean 4096-byte pages over HTTP range requests.
import { copyFile, rm, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { DB_PATH } from "../src/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DB = join(__dirname, "..", "web", "sgu.db");

async function main() {
  try {
    await stat(DB_PATH);
  } catch {
    console.error(`No index at ${DB_PATH}. Run \`npm run fetch && npm run index\` first.`);
    process.exit(1);
  }
  await copyFile(DB_PATH, WEB_DB);
  await rm(WEB_DB + "-wal", { force: true });
  await rm(WEB_DB + "-shm", { force: true });

  const db = new DatabaseSync(WEB_DB);
  // Keep the browser DB lean: the website uses episode-level FTS + the small
  // episode embeddings (for semantic search). The 177k-row segment tables are
  // MCP-only — drop them from the web copy so the static file stays small and
  // range requests touch fewer pages.
  db.exec("PRAGMA journal_mode=DELETE");
  db.exec("DROP TABLE IF EXISTS segments_fts");
  db.exec("DROP TABLE IF EXISTS segments");
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.exec("PRAGMA page_size=4096");
  db.exec("VACUUM");
  const n = (db.prepare("SELECT COUNT(*) n FROM episodes").get() as any).n;
  const emb = (db.prepare("SELECT COUNT(*) n FROM embeddings").get() as any).n;
  console.error(`web/sgu.db: ${n} episodes, ${emb} episode embeddings (segments dropped for size)`);
  db.close();
  await rm(WEB_DB + "-wal", { force: true });
  await rm(WEB_DB + "-shm", { force: true });

  const { size } = await stat(WEB_DB);
  console.error(`web/sgu.db ready: ${n} episodes, ${(size / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
