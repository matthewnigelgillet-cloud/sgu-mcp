// Split sgu.db into <25 MiB parts so it can be served as static assets on
// Cloudflare Pages (which caps any single file at 25 MiB). sql.js-httpvfs reads
// the parts in "chunked" mode, still fetching only the bytes each query needs.
//
//   node scripts/chunk-db.mjs            (uses .dbsrc/sgu.db or ../web/sgu.db)
//   SGU_DB_SRC=/path/to/sgu.db node scripts/chunk-db.mjs
import { openSync, readSync, writeFileSync, mkdirSync, statSync, existsSync, rmSync, closeSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC =
  process.env.SGU_DB_SRC ||
  (existsSync(join(ROOT, ".dbsrc/sgu.db")) ? join(ROOT, ".dbsrc/sgu.db") : join(ROOT, "../web/sgu.db"));
const OUT = join(ROOT, "public/db");

// 24 MiB: under the 25 MiB/file cap and an exact multiple of the 4096 request size.
const SERVER_CHUNK = 24 * 1024 * 1024;
const REQUEST_CHUNK = 4096;
const PREFIX = "sgu.db.";
const SUFFIX_LEN = 3;

if (!existsSync(SRC)) {
  console.error(`Source DB not found: ${SRC}\nRun \`node scripts/fetch-db.mjs\` first, or point SGU_DB_SRC at sgu.db.`);
  process.exit(1);
}

const size = statSync(SRC).size;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const fd = openSync(SRC, "r");
const buf = Buffer.alloc(SERVER_CHUNK);
let offset = 0;
let idx = 0;
while (offset < size) {
  const n = readSync(fd, buf, 0, SERVER_CHUNK, offset);
  if (n <= 0) break;
  writeFileSync(join(OUT, PREFIX + String(idx).padStart(SUFFIX_LEN, "0")), buf.subarray(0, n));
  offset += n;
  idx++;
}
closeSync(fd);

writeFileSync(
  join(OUT, "config.json"),
  JSON.stringify(
    {
      serverMode: "chunked",
      requestChunkSize: REQUEST_CHUNK,
      databaseLengthBytes: size,
      serverChunkSize: SERVER_CHUNK,
      urlPrefix: PREFIX,
      suffixLength: SUFFIX_LEN,
    },
    null,
    2
  )
);

console.error(`Chunked ${(size / 1048576).toFixed(1)} MB into ${idx} parts → public/db/ (+ config.json)`);
