// Download the prebuilt sgu.db (published by the publish-db GitHub Action) so a
// CI/CD build can chunk it. Used by `npm run build:cf` on Cloudflare Pages.
//   node scripts/fetch-db.mjs            (uses the db-latest release)
//   SGU_DB_URL=... node scripts/fetch-db.mjs
import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const URL_ =
  process.env.SGU_DB_URL ||
  "https://github.com/matthewnigelgillet-cloud/sgu-mcp/releases/download/db-latest/sgu.db";
const OUT = join(ROOT, ".dbsrc");
const DEST = join(OUT, "sgu.db");

await mkdir(OUT, { recursive: true });
console.error(`Downloading ${URL_}`);
const res = await fetch(URL_, { redirect: "follow" });
if (!res.ok || !res.body) {
  console.error(
    `Download failed (HTTP ${res.status}). The db-latest release must exist — run the ` +
      `"Publish prebuilt index" GitHub Action once, or set SGU_DB_URL.`
  );
  process.exit(1);
}
await pipeline(Readable.fromWeb(res.body), createWriteStream(DEST));
const { size } = await stat(DEST);
console.error(`Saved ${DEST} (${(size / 1048576).toFixed(1)} MB)`);
