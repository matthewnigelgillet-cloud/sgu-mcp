import { useActiveSection } from "../hooks";

const SECTION_LABELS = {
  hero: "01 · The Collection",
  plate: "02 · The Plate",
  "finding-aid": "03 · The Finding Aid",
  census: "04 · In Figures",
  galleries: "05 · The Galleries",
  colophon: "06 · Colophon",
};
const IDS = Object.keys(SECTION_LABELS);

/** Corner tick — a small brass L-bracket. */
function Corner({ className }) {
  return (
    <span aria-hidden className={`pointer-events-none absolute h-2 w-2 ${className}`}>
      <span className="absolute inset-0 border-brass/70" />
    </span>
  );
}

/**
 * The fixed brass plate-frame: a hairline border inset from the viewport with
 * corner ticks and a running head (wordmark left, running folio right) that
 * updates with the active section — the running head of a bound journal.
 */
export default function Frame() {
  const active = useActiveSection(IDS);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-3 z-50 sm:inset-6">
      <div className="relative h-full w-full border border-brass/30">
        {/* corner ticks */}
        <span className="absolute left-0 top-0 h-2.5 w-2.5 border-l border-t border-brass/70" />
        <span className="absolute right-0 top-0 h-2.5 w-2.5 border-r border-t border-brass/70" />
        <span className="absolute bottom-0 left-0 h-2.5 w-2.5 border-b border-l border-brass/70" />
        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 border-b border-r border-brass/70" />

        {/* running head */}
        <div className="absolute left-3 top-2 font-mono text-[0.6rem] uppercase tracking-wide text-graphite sm:left-4">
          SGU Archive
        </div>
        <div className="absolute right-3 top-2 font-mono text-[0.6rem] uppercase tracking-wide text-brass/80 transition-colors duration-500 sm:right-4">
          {SECTION_LABELS[active] || SECTION_LABELS.hero}
        </div>

        {/* running foot */}
        <div className="absolute bottom-2 left-3 font-mono text-[0.6rem] uppercase tracking-wide text-graphite sm:left-4">
          Folio 001
        </div>
        <div className="absolute bottom-2 right-3 hidden font-mono text-[0.6rem] uppercase tracking-wide text-graphite sm:right-4 sm:block">
          ⌘K — search the collection
        </div>
      </div>
    </div>
  );
}
