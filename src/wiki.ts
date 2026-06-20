// MediaWiki API client for sgutranscripts.org
// Docs: https://www.sgutranscripts.org/w/api.php

const API = "https://www.sgutranscripts.org/w/api.php";
const WIKI = "https://www.sgutranscripts.org/wiki/";
const UA = "sgu-mcp/0.1 (https://github.com/; personal MCP server)";

async function api(params: Record<string, string>): Promise<any> {
  const url = new URL(API);
  url.search = new URLSearchParams({ format: "json", ...params }).toString();
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`wiki API ${res.status} for ${params.action}`);
  const json = await res.json();
  if (json.error) throw new Error(`wiki API error: ${json.error.info ?? json.error.code}`);
  return json;
}

export interface SearchHit {
  title: string;
  pageid: number;
  snippet: string; // plain text, HTML stripped
  episode: number | null;
  url: string;
  timestamp?: string;
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

export function pageUrl(title: string): string {
  return WIKI + encodeURIComponent(title.replace(/ /g, "_"));
}

// News-item / SoF pages are titled like "Universal flu vaccine (497)" — episode in parens.
// Episode pages are titled "SGU Episode 1075".
export function episodeFromTitle(title: string): number | null {
  const ep = title.match(/^SGU Episode (\d+)/i);
  if (ep) return Number(ep[1]);
  const paren = title.match(/\((\d{1,4})\)\s*$/);
  if (paren) return Number(paren[1]);
  return null;
}

export async function search(query: string, limit = 10): Promise<SearchHit[]> {
  const json = await api({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: String(Math.min(Math.max(limit, 1), 50)),
    srnamespace: "0",
    srprop: "snippet|timestamp",
  });
  const hits: any[] = json?.query?.search ?? [];
  return hits.map((h) => ({
    title: h.title,
    pageid: h.pageid,
    snippet: stripHtml(h.snippet ?? ""),
    episode: episodeFromTitle(h.title),
    url: pageUrl(h.title),
    timestamp: h.timestamp,
  }));
}

export interface ParsedPage {
  title: string;
  pageid: number;
  wikitext: string;
  sections: { line: string; index: string; level: string }[];
}

export async function parsePage(title: string): Promise<ParsedPage | null> {
  let json: any;
  try {
    json = await api({
      action: "parse",
      page: title,
      prop: "wikitext|sections",
      redirects: "1",
    });
  } catch (e: any) {
    if (String(e.message).includes("missingtitle") || String(e.message).includes("404")) return null;
    throw e;
  }
  const p = json?.parse;
  if (!p) return null;
  return {
    title: p.title,
    pageid: p.pageid,
    wikitext: p.wikitext?.["*"] ?? "",
    sections: (p.sections ?? []).map((s: any) => ({ line: s.line, index: s.index, level: s.level })),
  };
}

export function episodePageTitle(n: number): string {
  return `SGU Episode ${n}`;
}

export async function pageExists(title: string): Promise<boolean> {
  const json = await api({ action: "query", titles: title, redirects: "1" });
  const pages = json?.query?.pages ?? {};
  return !Object.keys(pages).some((k) => k === "-1");
}
