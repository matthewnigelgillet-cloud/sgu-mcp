// Parse a cleaned episode Markdown body into speaker-turn segments.
// Each segment is one speaker's turn within a section, carrying the section
// title and (when present) a timestamp — the unit for occurrence counts,
// "jump to the moment" search, and per-speaker analytics.

export interface Segment {
  seq: number; // order within the episode
  section: string | null; // nearest preceding heading (timestamp stripped)
  timestamp: string | null; // mm:ss or h:mm:ss from the section heading, if any
  speaker: string; // raw tag, e.g. "S", "US#01", "Cara", "Voice-over"
  speakerName: string; // normalized display name
  text: string;
}

// SGU rogue initials -> names. Unknown tags (guests, US#NN, voice-overs) pass through.
const ROGUES: Record<string, string> = {
  S: "Steve",
  B: "Bob",
  C: "Cara",
  J: "Jay",
  E: "Evan",
  R: "Rebecca",
  P: "Perry",
};

export function normalizeSpeaker(raw: string): string {
  const tag = raw.trim();
  if (ROGUES[tag]) return ROGUES[tag];
  if (/^US#?\d+$/i.test(tag)) return "Unknown speaker";
  if (/^(voice[\s-]?over|vo)$/i.test(tag)) return "Voice-over";
  return tag; // guest name or anything else, as written
}

// Pull a trailing timestamp out of a heading: "News Item (11:31)" -> ["News Item","11:31"]
function splitTimestamp(heading: string): { title: string; timestamp: string | null } {
  const m = heading.match(/[\(\[]?(\d{1,2}:\d{2}(?::\d{2})?)[\)\]]?\s*$/);
  if (m) {
    return { title: heading.slice(0, m.index).replace(/[\(\[]\s*$/, "").trim(), timestamp: m[1] };
  }
  return { title: heading.trim(), timestamp: null };
}

const SPEAKER_RE = /^\*\*\s*([^*]+?)\s*:\s*\*\*\s*(.*)$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;

// Strip the YAML frontmatter and the title/aired preamble so we only parse prose.
function bodyOnly(md: string): string {
  let s = md;
  const fm = s.match(/^---\n[\s\S]*?\n---\n?/);
  if (fm) s = s.slice(fm[0].length);
  return s;
}

export function parseSegments(md: string): Segment[] {
  const lines = bodyOnly(md).split("\n");
  const segments: Segment[] = [];
  let section: string | null = null;
  let timestamp: string | null = null;
  let cur: Segment | null = null;
  let seq = 0;

  const flush = () => {
    if (cur) {
      cur.text = cur.text.replace(/\s+\n/g, "\n").trim();
      if (cur.text) segments.push(cur);
    }
    cur = null;
  };

  for (const line of lines) {
    const h = line.match(HEADING_RE);
    if (h) {
      flush();
      const lvl = h[1].length;
      // The "# Title" (H1) is the episode title, not a section.
      if (lvl >= 2) {
        const { title, timestamp: ts } = splitTimestamp(h[2]);
        section = title || section;
        timestamp = ts; // headings carry the segment's start time
      }
      continue;
    }

    const sp = line.match(SPEAKER_RE);
    if (sp) {
      flush();
      const speaker = sp[1].trim();
      cur = {
        seq: seq++,
        section,
        timestamp,
        speaker,
        speakerName: normalizeSpeaker(speaker),
        text: sp[2] ?? "",
      };
      continue;
    }

    // Continuation of the current turn (multi-line paragraph), or stray prose.
    if (cur) {
      cur.text += (cur.text ? "\n" : "") + line;
    }
    // Lines with no active speaker (e.g. "_Aired ..._", "_Source: ..._") are dropped.
  }
  flush();
  return segments;
}

// Count true occurrences of a term within a block of text (word-boundary,
// case-insensitive, prefix-aware). Used for accurate "how many times" answers.
export function countOccurrences(text: string, term: string): number {
  const t = term.trim().replace(/\*+$/, ""); // treat trailing * as prefix
  if (!t) return 0;
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // \b<term>\w*  — matches the stem and its inflections (homeopath -> homeopathy...)
  const re = new RegExp(`\\b${esc}\\w*`, "gi");
  const m = text.match(re);
  return m ? m.length : 0;
}
