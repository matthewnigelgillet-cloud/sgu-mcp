// Download a prebuilt SGU full-text index instead of scraping ~1000 wiki pages.
//   npm run setup
//
// Pulls data/sgu.db from the repo's latest GitHub Release (asset name: sgu.db).
// Override the source with SGU_DB_URL=... for forks or mirrors.
import { createWriteStream } from "node:fs";
import { mkdir, rm, stat, open } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DB_PATH } from "../src/db.js";

// Fixed `db-latest` tag (not /releases/latest) so the URL is stable even if code
// releases are cut. The publish-db workflow keeps this tag's asset fresh.
const DEFAULT_URL =
  "https://github.com/matthewnigelgillet-cloud/sgu-mcp/releases/download/db-latest/sgu.db";
const URL_ = process.env.SGU_DB_URL || DEFAULT_URL;

async function isSqlite(path: string): Promise<boolean> {
  const fh = await open(path, "r");
  try {
    const buf = Buffer.alloc(16);
    await fh.read(buf, 0, 16, 0);
    return buf.toString("utf8", 0, 15) === "SQLite format 3";
  } finally {
    await fh.close();
  }
}

async function main() {
  console.error(`Downloading prebuilt index from:\n  ${URL_}`);
  const res = await fetch(URL_, { redirect: "follow" });
  if (!res.ok || !res.body) {
    console.error(
      `\nDownload failed (HTTP ${res.status}).\n` +
        `No prebuilt index is published yet, or the URL is wrong.\n` +
        `Fall back to building it yourself:\n` +
        `  npm run fetch && npm run index\n` +
        `Or point SGU_DB_URL at a valid sgu.db asset.`
    );
    process.exit(1);
  }

  await mkdir(dirname(DB_PATH), { recursive: true });
  // Clear any stale WAL/SHM siblings so the fresh DB opens cleanly.
  await rm(DB_PATH + "-wal", { force: true });
  await rm(DB_PATH + "-shm", { force: true });

  const tmp = DB_PATH + ".download";
  await pipeline(Readable.fromWeb(res.body as any), createWriteStream(tmp));

  if (!(await isSqlite(tmp))) {
    await rm(tmp, { force: true });
    console.error(
      "\nDownloaded file is not a SQLite database (got an error page?).\n" +
        "Build it yourself instead: npm run fetch && npm run index"
    );
    process.exit(1);
  }

  await rm(DB_PATH, { force: true });
  const { rename } = await import("node:fs/promises");
  await rename(tmp, DB_PATH);

  const { size } = await stat(DB_PATH);
  console.error(`\nReady: ${DB_PATH} (${(size / 1024 / 1024).toFixed(1)} MB).`);
  console.error("Local-archive tools (search_episodes, archive_stats, …) are now live.");
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
