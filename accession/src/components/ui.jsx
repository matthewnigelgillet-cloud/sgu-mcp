import { useInView } from "../hooks";

/** Reveal-on-scroll wrapper: fades + rises once in view, with optional stagger delay. */
export function Reveal({ as: Tag = "div", delay = 0, className = "", children, ...rest }) {
  const [ref, inView] = useInView();
  return (
    <Tag
      ref={ref}
      className={`reveal ${inView ? "is-in" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** The centered max-measure container. */
export function Measure({ className = "", children }) {
  return <div className={`mx-auto w-full max-w-measure px-5 sm:px-8 ${className}`}>{children}</div>;
}

/**
 * A scholarly section: a left marginalia rail (numeral + kicker) on large screens,
 * inline kicker on mobile, and the main column.
 */
export function Section({ id, numeral, kicker, className = "", children }) {
  return (
    <section id={id} className={`scroll-mt-24 ${className}`}>
      <Measure>
        <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-[120px_minmax(0,1fr)]">
          {/* marginalia rail */}
          <div className="hidden lg:block">
            <div className="sticky top-24">
              {numeral && (
                <div className="font-serif text-[1.7rem] leading-none text-graphite">{numeral}</div>
              )}
              {kicker && (
                <div className="mt-3 font-mono text-[0.62rem] uppercase tracking-wide text-graphite">
                  {kicker}
                </div>
              )}
            </div>
          </div>
          <div className="max-w-column">
            {/* mobile kicker */}
            {(numeral || kicker) && (
              <div className="mb-5 flex items-center gap-3 lg:hidden">
                {numeral && <span className="font-serif text-base text-graphite">{numeral}</span>}
                {kicker && (
                  <span className="font-mono text-[0.6rem] uppercase tracking-wide text-graphite">
                    {kicker}
                  </span>
                )}
              </div>
            )}
            {children}
          </div>
        </div>
      </Measure>
    </section>
  );
}

/** Section divider: a full-measure hairline carrying a centered mono tab. */
export function SectionRule({ label }) {
  return (
    <Measure className="my-16 sm:my-24">
      <div className="relative flex items-center">
        <span className="h-px flex-1 bg-rule" />
        {label && (
          <span className="px-4 font-mono text-[0.62rem] uppercase tracking-wide text-graphite">
            {label}
          </span>
        )}
        <span className="h-px flex-1 bg-rule" />
      </div>
    </Measure>
  );
}

/** A small uppercase mono eyebrow. */
export function Eyebrow({ className = "", children }) {
  return (
    <span className={`font-mono text-[0.62rem] uppercase tracking-wide text-graphite ${className}`}>
      {children}
    </span>
  );
}
