// Minimal static file server with HTTP Range support, for testing the web/
// archive locally (sql.js-httpvfs needs range requests). No dependencies.
//   npm run web:serve   ->   http://localhost:8787
import { createServer } from "node:http";
import { stat, open } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..", "web");
const PORT = process.env.PORT || 8787;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".db": "application/octet-stream",
  ".json": "application/json",
  ".wasm": "application/wasm",
};

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent((req.url || "/").split("?")[0]);
    if (path === "/") path = "/index.html";
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    const info = await stat(file).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404).end("not found");
      return;
    }
    const type = TYPES[extname(file)] || "application/octet-stream";
    const fd = await open(file, "r");
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : info.size - 1;
      if (start > end || end >= info.size) end = info.size - 1;
      res.writeHead(206, {
        "Content-Type": type,
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes ${start}-${end}/${info.size}`,
        "Content-Length": end - start + 1,
      });
      fd.createReadStream({ start, end }).pipe(res).on("close", () => fd.close());
    } else {
      res.writeHead(200, { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Length": info.size });
      fd.createReadStream().pipe(res).on("close", () => fd.close());
    }
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
});
server.listen(PORT, () => console.error(`serving web/ at http://localhost:${PORT}`));
