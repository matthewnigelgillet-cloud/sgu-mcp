import { Section, Reveal } from "./ui";
import ScienceOrFiction from "./ScienceOrFiction";
import { ROGUES, SEGMENTS, THEMES, ERAS } from "../data";

function GalleryHead({ tag, title }) {
  return (
    <div className="mb-5 flex items-baseline gap-3">
      <span className="font-mono text-[0.62rem] uppercase tracking-label text-graphite">{tag}</span>
      <h3 className="font-serif text-[1.5rem] text-bone">{title}</h3>
    </div>
  );
}

/** An index line — a ruled entrance into a gallery. */
function IndexLine({ left, sub, right }) {
  return (
    <a
      href="#finding-aid"
      className="group flex items-baseline justify-between gap-4 border-t border-rule py-3.5"
    >
      <span className="min-w-0">
        <span className="font-serif text-[1.1rem] text-bone-dim transition-colors group-hover:text-bone">
          {left}
        </span>
        {sub && <span className="ml-3 font-mono text-[0.68rem] uppercase tracking-label text-graphite">{sub}</span>}
      </span>
      <span className="shrink-0 font-mono text-[0.78rem] tabular-nums text-graphite transition-colors group-hover:text-verdigris">
        {right}
      </span>
    </a>
  );
}

export default function Galleries() {
  return (
    <Section id="galleries" numeral="Ⅴ" kicker="From the collection">
      {/* Ⅴ.1 — the roster */}
      <Reveal>
        <GalleryHead tag="Ⅴ.1" title="The rogues of record" />
        <div>
          {ROGUES.map((r) => (
            <div
              key={r.name}
              className="group flex items-baseline justify-between gap-4 border-t border-rule py-3.5"
            >
              <span className="min-w-0">
                <span
                  className={`font-serif text-[1.12rem] ${r.memorial ? "text-brass" : "text-bone"}`}
                >
                  {r.name}
                </span>
                <span className="ml-3 font-mono text-[0.66rem] uppercase tracking-label text-graphite">
                  {r.role} · {r.tenure}
                </span>
                <span className="mt-1 block max-w-[52ch] font-serif text-[0.95rem] italic text-graphite opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  {r.note}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[0.78rem] tabular-nums text-graphite">
                {r.count.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </Reveal>

      {/* Ⅴ.2 — by segment */}
      <Reveal className="mt-16">
        <GalleryHead tag="Ⅴ.2" title="By segment" />
        {SEGMENTS.map((s) => (
          <IndexLine key={s.name} left={s.name} sub={s.note} right={s.count.toLocaleString()} />
        ))}
      </Reveal>

      {/* Ⅴ.3 — by theme */}
      <Reveal className="mt-16">
        <GalleryHead tag="Ⅴ.3" title="By theme" />
        {THEMES.map((t) => (
          <IndexLine key={t.name} left={t.name} right={t.count.toLocaleString()} />
        ))}
      </Reveal>

      {/* Ⅴ.4 — by era */}
      <Reveal className="mt-16">
        <GalleryHead tag="Ⅴ.4" title="By era" />
        {ERAS.map((e) => (
          <IndexLine key={e.name} left={e.name} sub={e.span} right={`${e.records} records`} />
        ))}
      </Reveal>

      {/* featured exhibit */}
      <Reveal className="mt-16">
        <GalleryHead tag="Ⅴ.5" title="On display" />
        <ScienceOrFiction />
      </Reveal>
    </Section>
  );
}
