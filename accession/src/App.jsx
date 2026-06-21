import { useEffect, useRef, useState } from "react";
import Frame from "./components/Frame";
import Hero from "./components/Hero";
import Plate from "./components/Plate";
import FindingAid from "./components/FindingAid";
import Census from "./components/Census";
import Galleries from "./components/Galleries";
import Colophon from "./components/Colophon";
import { SectionRule } from "./components/ui";
import { RECORDS } from "./data";

/** ⌘K — "the catalogue": keyboard-first retrieval, sober, brass-framed. */
function Catalogue({ open, onClose }) {
  const [q, setQ] = useState("");
  const inputRef = useRef(null);
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
    else setQ("");
  }, [open]);
  if (!open) return null;
  const results = RECORDS.filter((r) =>
    (r.title + r.accession).toLowerCase().includes(q.trim().toLowerCase())
  ).slice(0, 6);
  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/80 px-4 pt-[18vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl border border-brass/40 bg-ink shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-rule px-4 py-3">
          <span className="font-mono text-[0.62rem] uppercase tracking-label text-brass/80">
            Catalogue
          </span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the collection"
            className="w-full bg-transparent font-serif text-lg italic text-bone placeholder:text-graphite focus:outline-none"
          />
          <kbd className="font-mono text-[0.6rem] uppercase tracking-label text-graphite">esc</kbd>
        </div>
        <ul className="max-h-80 overflow-auto py-2">
          {results.map((r) => (
            <li key={r.accession}>
              <a
                href="#finding-aid"
                onClick={onClose}
                className="flex items-baseline justify-between gap-4 px-4 py-2.5 hover:bg-slate"
              >
                <span className="truncate font-serif text-bone">{r.title}</span>
                <span className="shrink-0 font-mono text-[0.66rem] uppercase tracking-label text-graphite">
                  {r.accession}
                </span>
              </a>
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-4 py-6 text-center font-mono text-[0.72rem] text-graphite">
              No records found.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

export default function App() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((s) => !s);
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative min-h-screen">
      <Frame />
      <main className="relative z-10 pb-10">
        <Hero />
        <SectionRule label="Fig. 1 — The Plate" />
        <Plate />
        <SectionRule label="Ⅲ — Consult the finding aid" />
        <FindingAid />
        <SectionRule label="Ⅳ — In figures" />
        <Census />
        <SectionRule label="Ⅴ — The galleries" />
        <Galleries />
        <Colophon />
      </main>
      <Catalogue open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
