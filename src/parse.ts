// Parsers for SGU transcript wikitext.
// The transcription bot produces well-structured templates:
//   {{InfoBox|episodeNum=|episodeDate=|caption=|bob=y|cara=y|...|qowText=...}}
//   == News Items ==  with === Title (mm:ss) === + {{shownotes|weblink=|article_title=|publication=}}
//   {{SOFinfo|theme=|item1=|link1web=|link1title=|...}}
//   {{anchor|...}} markers and '''S:''' '''J:''' speaker tags in transcript prose.

export const ROGUES = ["steve", "bob", "cara", "jay", "evan", "george", "rebecca", "perry"];

// --- template extraction -------------------------------------------------

// Return the full text of the first {{name ...}} block, brace-balanced.
export function extractTemplate(wikitext: string, name: string): string | null {
  const re = new RegExp(`\\{\\{\\s*${name}`, "i");
  const m = re.exec(wikitext);
  if (!m) return null;
  let i = m.index;
  let depth = 0;
  for (; i < wikitext.length; i++) {
    if (wikitext.startsWith("{{", i)) {
      depth++;
      i++;
    } else if (wikitext.startsWith("}}", i)) {
      depth--;
      i++;
      if (depth === 0) return wikitext.slice(m.index, i + 1);
    }
  }
  return null;
}

// Parse "|key = value" pairs from a template body. Values may span lines until
// the next top-level "|" or the closing "}}". Nested templates/links are kept intact.
export function parseTemplateParams(tpl: string): Record<string, string> {
  // strip outer {{name ... }}
  const inner = tpl.replace(/^\{\{[^|]*/, "").replace(/\}\}\s*$/, "");
  const params: Record<string, string> = {};
  let depth = 0;
  let buf = "";
  const parts: string[] = [];
  for (let i = 0; i < inner.length; i++) {
    const two = inner.slice(i, i + 2);
    if (two === "{{" || two === "[[") {
      depth++;
      buf += two;
      i++;
    } else if (two === "}}" || two === "]]") {
      depth--;
      buf += two;
      i++;
    } else if (inner[i] === "|" && depth === 0) {
      parts.push(buf);
      buf = "";
    } else {
      buf += inner[i];
    }
  }
  if (buf) parts.push(buf);
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (key) params[key] = val;
  }
  return params;
}

// --- cleaning ------------------------------------------------------------

export function cleanWikitext(s: string): string {
  return s
    .replace(/<!--[\s\S]*?-->/g, "") // comments
    .replace(/\{\{[^{}]*\}\}/g, "") // simple templates
    .replace(/'''?/g, "") // bold/italic
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1") // wikilinks -> label
    .replace(/\[https?:\/\/\S+\s+([^\]]*)\]/g, "$1") // ext links -> label
    .replace(/<\/?[^>]+>/g, "") // html tags
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// --- InfoBox -------------------------------------------------------------

export interface EpisodeInfo {
  episodeNum: number | null;
  caption: string | null;
  quoteOfTheWeek: { text: string | null; author: string | null };
  rogues: string[]; // present in episode
  guests: string[];
}

export function parseInfoBox(wikitext: string): EpisodeInfo {
  const tpl = extractTemplate(wikitext, "InfoBox");
  const empty: EpisodeInfo = {
    episodeNum: null,
    caption: null,
    quoteOfTheWeek: { text: null, author: null },
    rogues: [],
    guests: [],
  };
  if (!tpl) return empty;
  const p = parseTemplateParams(tpl);
  // Steve Novella is the permanent host; he has no InfoBox flag, so add him.
  const rogues = ["steve", ...ROGUES.filter((r) => r !== "steve" && (p[r] ?? "").toLowerCase().startsWith("y"))];
  const guests = Object.keys(p)
    .filter((k) => /^guest\d+$/.test(k) && p[k])
    .map((k) => p[k]);
  return {
    episodeNum: p.episodeNum ? Number(p.episodeNum) : null,
    caption: nullIfPlaceholder(stripQuotes(p.caption)),
    quoteOfTheWeek: {
      text: nullIfPlaceholder(stripQuotes(cleanInline(p.qowText))),
      author: nullIfPlaceholder(stripQuotes(cleanInline(p.qowAuthor))),
    },
    rogues,
    guests,
  };
}

function stripQuotes(s?: string): string {
  if (!s) return "";
  return s.replace(/^["'“”]+|["'“”]+$/g, "").trim();
}

// Clean inline wiki markup commonly found in InfoBox values: {{w|Name}} -> Name,
// wikilinks, bold, html, and trailing maintenance comments.
function cleanInline(s?: string): string {
  if (!s) return "";
  return s
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\{\{w\|([^}|]*)(?:\|[^}]*)?\}\}/gi, "$1")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Unfilled template defaults look like "AUTHOR, _short_description_" or contain
// "short_description". Treat those as no value.
function nullIfPlaceholder(s: string): string | null {
  if (!s) return null;
  if (/short_description|^AUTHOR\b|^TITLE\b|^\[?URL\b/i.test(s)) return null;
  return s;
}

// --- News Items ----------------------------------------------------------

export interface NewsItem {
  title: string;
  timestamp: string | null;
  link: string | null;
  source: string | null;
}

export function parseNewsItems(wikitext: string): NewsItem[] {
  const items: NewsItem[] = [];
  // Section headings inside News Items: "=== Title (mm:ss) ===" (level 3)
  // followed (optionally) by a {{shownotes|weblink=|publication=}} template.
  const lines = wikitext.split("\n");
  let inNews = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^==\s*News Items\s*==/.test(line)) {
      inNews = true;
      continue;
    }
    if (inNews && /^==[^=]/.test(line)) break; // next level-2 section ends News Items
    if (!inNews) continue;
    const h = line.match(/^===\s*(.+?)\s*===\s*$/);
    if (!h) continue;
    let title = h[1];
    let timestamp: string | null = null;
    const tsMatch = title.match(/<small>\s*\(?([\d:]+)\)?\s*<\/small>/);
    if (tsMatch) timestamp = tsMatch[1];
    title = title.replace(/<small>.*?<\/small>/g, "").trim();
    // look ahead for shownotes template
    const ahead = lines.slice(i + 1, i + 12).join("\n");
    const sn = extractTemplate(ahead, "shownotes");
    let link: string | null = null;
    let source: string | null = null;
    if (sn) {
      const p = parseTemplateParams(sn);
      link = p.weblink || null;
      source = p.publication || p.article_title || null;
    }
    items.push({ title: cleanWikitext(title), timestamp, link, source });
  }
  return items;
}

// --- Science or Fiction --------------------------------------------------

export interface SoFItem {
  number: number;
  text: string;
  link: string | null;
  verdict: "science" | "fiction" | null; // null when not machine-encoded
}

export interface ScienceOrFiction {
  theme: string | null;
  items: SoFItem[];
  answerKnown: boolean; // true only if the fiction item was machine-encoded
}

export function parseScienceOrFiction(wikitext: string): ScienceOrFiction | null {
  const tpl = extractTemplate(wikitext, "SOFinfo");
  if (!tpl) return null;
  const p = parseTemplateParams(tpl);

  // The fiction item is usually NOT in SOFinfo. The transcription bot sometimes
  // leaves it in an HTML comment with quiz__answer--fiction near each item.
  const fictionIndex = findFictionFromBotComment(wikitext);

  const items: SoFItem[] = [];
  for (let n = 1; n <= 8; n++) {
    const text = p[`item${n}`];
    if (!text) continue;
    let verdict: SoFItem["verdict"] = null;
    if (fictionIndex !== null) verdict = n === fictionIndex ? "fiction" : "science";
    items.push({
      number: n,
      text: cleanWikitext(text),
      link: p[`link${n}web`] || null,
      verdict,
    });
  }
  return {
    theme: p.theme || p.hiddentheme || null,
    items,
    answerKnown: fictionIndex !== null,
  };
}

// The bot embeds raw scraped HTML in a leading comment when it hits issues:
//   <span class="quiz__answer quiz__answer--fiction">Fiction</span>
//   <p>Exoplanet hunters...</p>   (item text follows)
// Match the fiction item's text back to its SOFinfo item number.
function findFictionFromBotComment(wikitext: string): number | null {
  const comment = wikitext.match(/<!--[\s\S]*?-->/);
  if (!comment) return null;
  const block = comment[0];
  // Find the item marked fiction and grab the <p>...</p> text after it.
  const items = [...block.matchAll(/science-fiction__item[\s\S]*?<\/li>/g)];
  for (let i = 0; i < items.length; i++) {
    if (/quiz__answer--fiction/.test(items[i][0])) return i + 1; // Item #N order
  }
  return null;
}

// Pull the rendered transcript prose of a named section, for reading off the
// SoF reveal when the answer isn't machine-encoded.
export function extractSectionText(wikitext: string, headingRegex: RegExp): string | null {
  const lines = wikitext.split("\n");
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(==+)\s*(.+?)\s*==+\s*$/);
    if (m && headingRegex.test(m[2])) {
      start = i + 1;
      level = m[1].length;
      break;
    }
  }
  if (start === -1) return null;
  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const m = lines[i].match(/^(==+)\s*(.+?)\s*==+\s*$/);
    if (m && m[1].length <= level) break;
    out.push(lines[i]);
  }
  return cleanWikitext(out.join("\n"));
}
