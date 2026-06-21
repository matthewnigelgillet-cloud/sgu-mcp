import { Section } from "./ui";
import { useInView, useCountUp } from "../hooks";
import { CENSUS, ROGUES } from "../data";

function CensusRow({ item }) {
  const [ref, inView] = useInView({ threshold: 0.6 });
  const v = useCountUp(item.n, inView, 1000);
  const display = Math.round(v).toLocaleString();
  return (
    <div ref={ref} className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-5 border-t border-rule py-4 sm:gap-x-8">
      <span
        className={`text-right font-mono text-[1.7rem] tabular-nums sm:text-[2.1rem] ${
          item.lead ? "text-verdigris" : "text-bone"
        }`}
      >
        {item.suffix === "≈" && <span className="text-graphite">≈</span>}
        {display}
        {item.suffix === "%" && <span>%</span>}
      </span>
      <span className="font-serif text-[1.02rem] leading-snug text-graphite">{item.caption}</span>
    </div>
  );
}

/** Distribution as micro-stratigraphy — a hairline strata bar, not a chart widget. */
function Strata() {
  const max = Math.max(...ROGUES.map((r) => r.count));
  return (
    <div className="mt-12">
      <p className="font-mono text-[0.66rem] uppercase tracking-label text-graphite">
        Records by rogue of presence
      </p>
      <div className="mt-4 space-y-2.5">
        {ROGUES.filter((r) => !r.memorial).map((r) => (
          <div key={r.name} className="grid grid-cols-[120px_minmax(0,1fr)_auto] items-center gap-3">
            <span className="truncate font-serif text-[0.95rem] text-bone-dim">{r.name.split(" ")[0]}</span>
            <span className="h-1.5 bg-rule">
              <span
                className="block h-full bg-verdigris/70"
                style={{ width: `${(r.count / max) * 100}%` }}
              />
            </span>
            <span className="font-mono text-[0.72rem] tabular-nums text-graphite">{r.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Census() {
  return (
    <Section id="census" numeral="Ⅳ" kicker="The collection in figures">
      <div>
        {CENSUS.map((item, i) => (
          <CensusRow key={i} item={item} />
        ))}
        <div className="mt-4 border-t border-brass/40 pt-3">
          <span className="font-mono text-[0.66rem] uppercase tracking-label text-graphite">
            Figures current to the latest accession, SGU·1092.
          </span>
        </div>
      </div>
      <Strata />
    </Section>
  );
}
