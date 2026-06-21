import { useEffect, useRef, useState } from "react";
import { Section } from "./ui";
import AccessionRecord from "./AccessionRecord";
import ReferenceDesk from "./ReferenceDesk";
import { useArchiveReady } from "../hooks";
import { searchEpisodes } from "../archive";

const BEGINNINGS = ["homeopathy", "cancer", "artificial intelligence", "Bigfoot", "cold fusion"];

function PathTab({ active, onClick, children, note, href }) {
  const base = `group flex-1 border-b-2 pb-3 text-left transition-colors ${
    active ? "border-verdigris" : "border-transparent hover:border-rule"
  }`;
  const title = (
    <span
      className={`block font-serif text-[1.15rem] transition-colors ${
        active ? "text-bone" : "text-graphite group-hover:text-bone"
      }`}
    >
      {children}
      {href && <span className="ml-1 text-verdigris">↗</span>}
    </span>
  );
  const sub = (
    <span className="mt-0.5 block font-mono text-[0.62rem] uppercase tracking-label text-graphite">
      {note}
    </span>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener" className={base}>
        {title}
        {sub}
      </a>
    );
  }
  return (
    <button onClick={onClick} className={base}>
      {title}
      {sub}
    </button>
  );
}

function FreeSearch() {
  const { ready, error } = useArchiveReady();
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("");
  const [data, setData] = useState({ rows: [], total: 0, byYear: [] });
  const [loading, setLoading] = useState(false);
  const debounce = useRef();

  useEffect(() => {
    if (!ready) return;
    clearTimeout(debounce.current);
    if (!query.trim()) {
      setData({ rows: [], total: 0, byYear: [] });
      return;
    }
    setLoading(true);
    debounce.current = setTimeout(async () => {
      try {
        setData(await searchEpisodes(query, { year }));
      } catch (e) {
        setData({ rows: [], total: 0, byYear: [], error: e.message });
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(debounce.current);
  }, [query, year, ready]);

  const hasQuery = query.trim().length > 0;

  return (
    <div>
      {/* the query line — written in the scholar's hand */}
      <div className="flex items-center gap-3 border-b border-bone/80 pb-2 transition-colors focus-within:border-verdigris">
        <span className="animate-pulse select-none font-mono text-[1.1rem] text-verdigris">▸</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={ready ? "Search the collection — a topic, a name, a claim" : "Calibrating the index…"}
          aria-label="Search the collection"
          disabled={!ready}
          className="w-full bg-transparent font-serif text-[1.35rem] italic text-bone placeholder:text-graphite focus:outline-none disabled:opacity-60 sm:text-[1.55rem]"
        />
      </div>

      {error && (
        <p className="mt-4 font-mono text-[0.75rem] text-oxblood">
          ✕ Couldn't open the index: {error}. The database must be served with range-request support.
        </p>
      )}

      {hasQuery && (
        <>
          {/* count + year chips, announced as scholarship */}
          <div className="mt-6 flex items-baseline justify-between">
            <span className="font-mono text-[0.7rem] uppercase tracking-label text-graphite">
              <span className="text-verdigris">{data.total.toLocaleString()}</span> record
              {data.total === 1 ? "" : "s"} in the finding aid
              {loading && <span className="ml-2 text-graphite">· reading…</span>}
            </span>
          </div>

          {data.byYear.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.byYear.map((y) => (
                <button
                  key={y.yr}
                  onClick={() => setYear(year === y.yr ? "" : y.yr)}
                  className={`border px-2.5 py-1 font-mono text-[0.68rem] tabular-nums transition-colors ${
                    year === y.yr
                      ? "border-verdigris bg-verdigris/10 text-bone"
                      : "border-rule text-graphite hover:border-verdigris/60 hover:text-bone-dim"
                  }`}
                >
                  {y.yr} <span className="text-graphite">{y.n}</span>
                </button>
              ))}
            </div>
          )}

          <div className="mt-2">
            {data.rows.length > 0 ? (
              data.rows.map((r, i) => <AccessionRecord key={r.episode} record={r} index={i} />)
            ) : !loading ? (
              <p className="border-t border-rule py-10 text-center font-mono text-[0.8rem] text-graphite">
                No records answer to “{query}”{year ? ` in ${year}` : ""}. Try a broader term.
              </p>
            ) : null}
          </div>
        </>
      )}

      {!hasQuery && (
        <div className="mt-10 border-t border-rule pt-6">
          <p className="font-mono text-[0.66rem] uppercase tracking-label text-graphite">Begin with</p>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {BEGINNINGS.map((b) => (
              <button
                key={b}
                onClick={() => setQuery(b)}
                disabled={!ready}
                className="font-serif text-[1.05rem] text-bone-dim underline-offset-4 transition-colors hover:text-bone hover:underline hover:decoration-brass disabled:opacity-50"
              >
                {b}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FindingAid() {
  const [path, setPath] = useState("free");
  return (
    <Section id="finding-aid" numeral="Ⅲ" kicker="Consult the finding aid">
      {/* two paths, the visitor's choice */}
      <div className="mb-8 flex flex-wrap gap-x-6 gap-y-4">
        <PathTab active={path === "free"} onClick={() => setPath("free")} note="Free · no key">
          Search the record
        </PathTab>
        <PathTab active={path === "claude"} onClick={() => setPath("claude")} note="Bring your Claude key">
          Ask the reference desk
        </PathTab>
        <PathTab
          href="https://github.com/matthewnigelgillet-cloud/sgu-mcp"
          note="Run it in Claude · GitHub"
        >
          Get the SGU MCP
        </PathTab>
      </div>

      {path === "free" ? <FreeSearch /> : <ReferenceDesk />}
    </Section>
  );
}
