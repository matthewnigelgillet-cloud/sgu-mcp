import { Measure } from "./ui";
import { COLLECTION } from "../data";

function Census() {
  const { established, records, daysOnAir, spanFrom, spanTo } = COLLECTION;
  const bits = [
    ["EST.", String(established)],
    [null, `${records.toLocaleString()} RECORDS`, true],
    [null, `${daysOnAir.toLocaleString()} DAYS ON AIR`],
    [null, `${spanFrom}–${spanTo}`],
  ];
  return (
    <div className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[0.7rem] uppercase tracking-label sm:text-[0.78rem]">
      {bits.map(([label, val, lead], i) => (
        <span key={i} className="flex items-center gap-3">
          {i > 0 && <span className="text-brass/70">·</span>}
          <span className={lead ? "text-verdigris" : "text-bone"}>
            {label && <span className="mr-1 text-graphite">{label}</span>}
            {val}
          </span>
        </span>
      ))}
    </div>
  );
}

export default function Hero() {
  const { latest } = COLLECTION;
  return (
    <section id="hero" className="scroll-mt-24 pt-24 sm:pt-32">
      <Measure>
        <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-[120px_minmax(0,1fr)]">
          <div className="hidden lg:block">
            <div className="font-serif text-[1.7rem] leading-none text-graphite">Ⅰ</div>
            <div className="mt-3 font-mono text-[0.62rem] uppercase tracking-wide text-graphite">
              The Collection
            </div>
          </div>

          <div className="max-w-column">
            <h1 className="font-serif font-semibold uppercase leading-[0.92] tracking-[-0.01em] text-bone [text-shadow:0_0_30px_rgba(182,146,79,0.12)]">
              <span className="block animate-settle text-[clamp(3rem,11vw,6rem)]">SGU</span>
              <span
                className="block animate-settle text-[clamp(3rem,11vw,6rem)]"
                style={{ animationDelay: "90ms" }}
              >
                Archive
              </span>
            </h1>

            {/* brass rule draws in */}
            <div
              className="mt-7 h-px w-60 max-w-full origin-left animate-drawX bg-brass/70"
              style={{ animationDelay: "260ms" }}
            />

            <p
              className="mt-6 max-w-[34ch] animate-settle font-serif text-[1.35rem] italic leading-snug text-bone-dim sm:text-[1.55rem]"
              style={{ animationDelay: "340ms" }}
            >
              The complete transcript record of The Skeptics' Guide to the Universe.
            </p>
            <p
              className="mt-3 animate-settle font-sans text-[0.95rem] text-graphite"
              style={{ animationDelay: "420ms" }}
            >
              Twenty years of evidence, catalogued and searchable.
            </p>

            <Census />

            {/* latest accession — recency framed as an acquisition, not a feed */}
            <a
              href="#finding-aid"
              className="group mt-10 inline-flex max-w-full flex-col gap-1 border-l-2 border-transparent pl-0 transition-[padding,border-color] duration-300 hover:border-verdigris hover:pl-4"
            >
              <span className="font-mono text-[0.72rem] uppercase tracking-label text-graphite">
                <span className="mr-2 text-verdigris">▸</span>latest accession
                <span className="mx-2 text-bone">{latest.accession}</span>
                <span className="text-graphite">— {latest.date}</span>
              </span>
              <span className="font-serif text-[1.05rem] text-bone transition-colors group-hover:text-bone">
                {latest.title}
              </span>
            </a>
          </div>
        </div>
      </Measure>
    </section>
  );
}
