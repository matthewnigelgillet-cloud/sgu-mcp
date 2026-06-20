// SGU podcast RSS feed (libsyn-backed). Source of recent-episode metadata and
// audio URLs, which the transcript wiki does not carry.
import { XMLParser } from "fast-xml-parser";

const FEED = "https://feed.theskepticsguide.org/feed/rss.aspx";
const UA = "sgu-mcp/0.1";

export interface FeedEpisode {
  episode: number | null;
  title: string;
  date: string | null; // ISO
  summary: string;
  audioUrl: string | null;
  durationSeconds: number | null;
  link: string | null;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

let cache: { at: number; items: FeedEpisode[] } | null = null;
const TTL = 10 * 60 * 1000; // 10 min

function episodeFromTitle(title: string): number | null {
  const m = title.match(/#\s*(\d{1,4})/);
  return m ? Number(m[1]) : null;
}

function durationToSeconds(d?: string): number | null {
  if (!d) return null;
  if (/^\d+$/.test(d)) return Number(d);
  const parts = d.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export async function getFeed(force = false): Promise<FeedEpisode[]> {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.items;
  const res = await fetch(FEED, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`RSS feed ${res.status}`);
  const xml = await res.text();
  const doc = parser.parse(xml);
  const rawItems = doc?.rss?.channel?.item ?? [];
  const arr = Array.isArray(rawItems) ? rawItems : [rawItems];
  const items: FeedEpisode[] = arr.map((it: any) => {
    const title = String(it.title ?? "");
    const enc = it.enclosure;
    const date = it.pubDate ? new Date(it.pubDate).toISOString() : null;
    return {
      episode: episodeFromTitle(title),
      title,
      date,
      summary: String(it.description ?? it["itunes:summary"] ?? "").trim(),
      audioUrl: enc?.["@_url"] ?? null,
      durationSeconds: durationToSeconds(it["itunes:duration"]),
      link: it.link ?? null,
    };
  });
  cache = { at: Date.now(), items };
  return items;
}

export async function getEpisodeFromFeed(n: number): Promise<FeedEpisode | null> {
  const items = await getFeed();
  return items.find((i) => i.episode === n) ?? null;
}

export async function getLatest(limit = 5): Promise<FeedEpisode[]> {
  const items = await getFeed();
  return items.slice(0, Math.min(Math.max(limit, 1), 30));
}
