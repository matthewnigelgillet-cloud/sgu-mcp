import { Measure } from "./ui";

export default function Colophon() {
  return (
    <footer id="colophon" className="mt-24 scroll-mt-24 pb-20">
      <Measure>
        <div className="h-px w-full bg-brass/40" />
        <div className="grid grid-cols-1 gap-x-8 pt-8 lg:grid-cols-[120px_minmax(0,1fr)]">
          <div className="hidden lg:block">
            <span className="font-serif text-[1.7rem] leading-none text-graphite">Ⅵ</span>
            <div className="mt-3 font-mono text-[0.62rem] uppercase tracking-wide text-graphite">
              Colophon
            </div>
          </div>
          <div className="max-w-column">
            <p className="font-serif text-[1.1rem] italic leading-relaxed text-bone-dim">
              This archive is compiled from the volunteer transcripts at sgutranscripts.org and the
              official SGU feed. Set in Spectral and IBM Plex. An unofficial work of stewardship —
              search runs entirely in your browser.
            </p>
            <p className="mt-5 font-sans text-[0.9rem] leading-relaxed text-graphite">
              With gratitude to the transcribers who have kept the record for two decades. Transcripts
              remain the work of their authors; audio and likenesses belong to SGU Productions. This is
              an unofficial fan archive, made for study and recall.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[0.66rem] uppercase tracking-label text-graphite">
              <span>Folio 001 · The Collection</span>
              <span className="text-brass/60">·</span>
              <a href="#hero" className="hover:text-verdigris">
                Return to the title page
              </a>
              <span className="text-brass/60">·</span>
              <span>⌘K to search</span>
            </div>
          </div>
        </div>
      </Measure>
    </footer>
  );
}
