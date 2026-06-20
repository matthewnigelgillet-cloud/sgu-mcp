#!/usr/bin/env node
// MCP server for The Skeptics' Guide to the Universe — Streamable HTTP entrypoint.
// This is the "remote connector" transport: host it, and Claude (Desktop / Code /
// Team / Enterprise custom connectors) can connect to it over HTTP so people search
// the SGU archive with their own Claude account — no per-request cost to you.
//
// Run:   npm run start:http      (PORT, HOST, SGU_MCP_TOKEN env vars)
// Health: GET /healthz           MCP endpoint: POST /mcp
//
// Auth: if SGU_MCP_TOKEN is set, every /mcp request must send
//   Authorization: Bearer <that token>
// If it is NOT set, the server refuses to bind to a public interface (it stays on
// 127.0.0.1) so an unauthenticated MCP endpoint is never exposed by accident.
// For a public Claude.ai connector you'll want full OAuth 2.1 in front — see README.
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";

const PORT = Number(process.env.PORT || 8788);
const TOKEN = process.env.SGU_MCP_TOKEN || "";
// Without a token we only bind to loopback. With one, default to all interfaces so
// it can be deployed (override with HOST).
const HOST = process.env.HOST || (TOKEN ? "0.0.0.0" : "127.0.0.1");

const CORS = {
  "Access-Control-Allow-Origin": process.env.SGU_CORS_ORIGIN || "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", ...CORS });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 4 * 1024 * 1024) reject(new Error("request body too large"));
    });
    req.on("end", () => {
      if (!data) return resolve(undefined);
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function authorized(req: IncomingMessage): boolean {
  if (!TOKEN) return true; // loopback-only mode
  const h = req.headers["authorization"] || "";
  return h === `Bearer ${TOKEN}`;
}

const httpServer = createHttpServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  if (url.pathname === "/healthz") {
    send(res, 200, { ok: true, server: "sgu-mcp", transport: "streamable-http" });
    return;
  }
  if (url.pathname !== "/mcp") {
    send(res, 404, { error: "not found", hint: "MCP endpoint is POST /mcp" });
    return;
  }
  if (!authorized(req)) {
    res.writeHead(401, { ...CORS, "WWW-Authenticate": 'Bearer realm="sgu-mcp"' });
    res.end(JSON.stringify({ error: "unauthorized", hint: "send Authorization: Bearer <SGU_MCP_TOKEN>" }));
    return;
  }
  if (req.method !== "POST") {
    // Stateless mode: no server-initiated SSE stream, so GET/DELETE aren't used.
    send(res, 405, { error: "method not allowed", hint: "use POST for MCP messages" });
    return;
  }

  // Stateless: a fresh server + transport per request. Simple and safe for a
  // read-only server; no session state to leak between callers.
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    const body = await readBody(req);
    await transport.handleRequest(req, res, body);
  } catch (e: any) {
    if (!res.headersSent) send(res, 400, { error: e.message });
  }
});

httpServer.listen(PORT, HOST, () => {
  console.error(`sgu-mcp (HTTP) listening on http://${HOST}:${PORT}/mcp`);
  if (!TOKEN) {
    console.error(
      "WARNING: SGU_MCP_TOKEN is not set — bound to loopback only. " +
        "Set SGU_MCP_TOKEN (and put OAuth/a proxy in front) before exposing publicly."
    );
  }
});
