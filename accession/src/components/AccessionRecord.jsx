import { Reveal } from "./ui";

// Only allow http(s) links — neutralises any javascript:/data: URL that could
// slip in from scraped DB content and run script on click.
function safeHref(u) {
  if (!u) return null;
  try {
    const p = new URL(u, window.location.origin);
    return p.protocol === "http:" || p.protocol === "https:" ? p.href : null;
  } catch {
    return null;
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(+d)) return String(iso).slice(0, 10);
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// Render a snippet that uses « » highlight markers — no HTML injection.
function Snippet({ text }) {
  const parts = String(text).split(/[«»]/);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-transparent font-medium text-bone underline decoration-brass/70 underline-offset-2">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

const ROGUE_NAME = { steve: "Steve", bob: "Bob", cara: "Cara", jay: "Jay", evan: "Evan", rebecca: "Rebecca", perry: "Perry" };

/** A single accession record — the specimen label, real archive data. */
export default function AccessionRecord({ record, index = 0 }) {
  const r = record;
  const acc = `SGU·${String(r.episode).padStart(4, "0")}`;
  const rogues = (r.rogues || []).map((x) => ROGUE_NAME[x] || x).join(" · ");
  return (
    <Reveal
      as="article"
      delay={Math.min(index, 6) * 45}
      className="group relative border-t border-rule py-7 pl-4"
    >
      <span className="absolute left-0 top-0 h-full w-0.5 origin-top scale-y-0 bg-verdigris transition-transform duration-300 ease-archival group-hover:scale-y-100" />

      <div className="flex items-baseline justify-between gap-4">
        <span className="font-mono text-[0.68rem] uppercase tracking-label text-bone-dim">{acc}</span>
        <span className="shrink-0 font-mono text-[0.68rem] uppercase tracking-label text-graphite">
          {fmtDate(r.date)}
        </span>
      </div>

      <h3 className="mt-2 font-serif text-[1.3rem] leading-snug text-bone transition-colors group-hover:text-white">
        {r.theme && !/^\d/.test(r.theme) ? r.theme : `Episode ${r.episode}`}
      </h3>

      {rogues && (
        <p className="mt-1.5 font-mono text-[0.72rem] tracking-wide text-graphite">
          {rogues}
          <span className="ml-3 text-verdigris">◇ transcribed</span>
        </p>
      )}

      <p className="mt-3 max-w-[60ch] font-serif text-[1.02rem] italic leading-relaxed text-bone-dim">
        “<Snippet text={r.snippet} />”
      </p>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[0.66rem] uppercase tracking-label">
        {safeHref(r.url) && (
          <a href={safeHref(r.url)} target="_blank" rel="noopener noreferrer" className="text-graphite underline-offset-4 hover:text-verdigris hover:underline">
            Transcript
          </a>
        )}
        {safeHref(r.audio) && (
          <a href={safeHref(r.audio)} target="_blank" rel="noopener noreferrer" className="text-graphite underline-offset-4 hover:text-verdigris hover:underline">
            Audio
          </a>
        )}
      </div>
    </Reveal>
  );
}
