#!/usr/bin/env node
// MCP server for The Skeptics' Guide to the Universe — stdio entrypoint.
// (Local clients: Claude Desktop, Claude Code, etc.)
// For remote / connector hosting over HTTP, see src/http.ts.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("sgu-mcp running on stdio");
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
