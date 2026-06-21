import { useState } from "react";
import { SOF } from "../data";

const NUM = ["Ⅰ", "Ⅱ", "Ⅲ"];

/** The featured artifact — a sealed exhibit. "Break the seal" to adjudicate. */
export default function ScienceOrFiction() {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="border border-rule bg-plate/60 p-6 sm:p-8">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[0.66rem] uppercase tracking-label text-brass/80">
          Featured exhibit — Science or Fiction
        </span>
        <span className="font-mono text-[0.66rem] tracking-label text-graphite">{SOF.episode}</span>
      </div>

      <p className="mt-4 font-serif text-[1.15rem] italic text-bone-dim">
        Theme — {SOF.theme}. Three items; one is fabricated.
      </p>

      <ol className="mt-5 space-y-4">
        {SOF.items.map((item, i) => {
          const isFiction = i === SOF.fiction;
          return (
            <li key={i} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
              <span
                className={`font-serif text-[1.05rem] ${
                  revealed && isFiction ? "text-oxblood" : "text-graphite"
                }`}
              >
                {NUM[i]}
              </span>
              <span
                className={`font-serif text-[1.05rem] leading-snug transition-colors duration-700 ${
                  revealed
                    ? isFiction
                      ? "text-oxblood"
                      : "text-bone"
                    : "text-bone-dim"
                }`}
              >
                {item}
                {revealed && isFiction && (
                  <span className="ml-2 font-mono text-[0.62rem] uppercase tracking-label text-oxblood">
                    ← fiction
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={() => setRevealed((s) => !s)}
          className="font-mono text-[0.68rem] uppercase tracking-label text-verdigris underline-offset-4 transition-colors hover:text-bone"
        >
          {revealed ? "▸ reseal" : "▸ break the seal"}
        </button>
        <span className="h-px flex-1 bg-rule" />
      </div>
    </div>
  );
}
