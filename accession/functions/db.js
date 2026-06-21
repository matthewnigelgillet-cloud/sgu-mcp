// Cloudflare Pages Function — serves the search database at /db with HTTP range
// support. Cloudflare Pages doesn't reliably honour Range on static assets, and
// the GitHub release asset honours Range but sends no CORS header. So we proxy
// server-side: the browser talks to /db (same-origin, no CORS), and we forward
// its Range header to the release asset (which returns 206) and stream it back.
const DB_URL =
  "https://github.com/matthewnigelgillet-cloud/sgu-mcp/releases/download/db-latest/sgu.db";

export async function onRequest(context) {
  const { request } = context;
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const init = { method: request.method, redirect: "follow", headers: {} };
  const range = request.headers.get("Range");
  if (range) init.headers["Range"] = range;

  const upstream = await fetch(DB_URL, init);

  const headers = new Headers();
  for (const h of ["content-range", "content-length", "content-type", "etag", "last-modified"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "public, max-age=86400");

  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status, // 206 for ranged reads, 200 otherwise
    statusText: upstream.statusText,
    headers,
  });
}
