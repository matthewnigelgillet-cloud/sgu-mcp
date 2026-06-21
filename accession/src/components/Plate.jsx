import { useEffect, useRef, useState } from "react";
import { Section } from "./ui";
import { useInView, useReducedMotion } from "../hooks";
import { COLLECTION } from "../data";

// Synthesize the collection's record dates — weekly, 2005-05 → 2026-02.
function buildRecords() {
  const start = Date.UTC(2005, 4, 4);
  const recs = [];
  for (let i = 0; i < COLLECTION.records; i++) {
    const t = start + i * 7 * 86400000;
    recs.push({ t, year: new Date(t).getUTCFullYear() });
  }
  return recs;
}

// Visible-wavelength → RGB, then muted toward warm grey so it reads as a
// PRINTED plate, never an LED. 0 = oldest (red) … 1 = newest (violet).
function plateColor(p) {
  const nm = 645 - p * (645 - 415);
  let r = 0, g = 0, b = 0;
  if (nm < 440) { r = -(nm - 440) / (440 - 380); b = 1; }
  else if (nm < 490) { g = (nm - 440) / (490 - 440); b = 1; }
  else if (nm < 510) { g = 1; b = -(nm - 510) / (510 - 490); }
  else if (nm < 580) { r = (nm - 510) / (580 - 510); g = 1; }
  else if (nm < 645) { r = 1; g = -(nm - 645) / (645 - 580); }
  else { r = 1; }
  const mix = (c, t) => Math.round((c * 255) * (1 - 0.46) + t * 0.46);
  return [mix(r, 122), mix(g, 120), mix(b, 130)];
}

export default function Plate() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [viewRef, inView] = useInView({ threshold: 0.3 });
  const reduced = useReducedMotion();
  const [cursor, setCursor] = useState(null); // { x, year, count }
  const recsRef = useRef(buildRecords());
  const geomRef = useRef({ x0: 0, x1: 1, minT: 0, maxT: 1 });

  // year → count, for the hover read-off
  const counts = useRef(
    recsRef.current.reduce((m, r) => ((m[r.year] = (m[r.year] || 0) + 1), m), {})
  ).current;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    const recs = recsRef.current;
    const minT = recs[0].t;
    const maxT = recs[recs.length - 1].t;

    let raf;
    const pads = { l: 18, r: 18, t: 18, b: 26 };

    const render = (progress) => {
      const dpr = window.devicePixelRatio || 1;
      const W = wrap.clientWidth;
      const H = wrap.clientHeight;
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr;
        canvas.height = H * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const x0 = pads.l, x1 = W - pads.r, baseY = H - pads.b, plotH = H - pads.t - pads.b;
      geomRef.current = { x0, x1, minT, maxT };
      const xOf = (t) => x0 + ((t - minT) / (maxT - minT)) * (x1 - x0);

      // graticule — faint quartile rules
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(34,42,56,0.9)";
      for (let k = 0; k <= 4; k++) {
        const y = pads.t + (k / 4) * plotH;
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      }
      // brass 5-year majors
      for (let yr = 2005; yr <= 2026; yr += 5) {
        const x = xOf(Date.UTC(yr, 0, 1));
        ctx.strokeStyle = "rgba(182,146,79,0.35)";
        ctx.beginPath(); ctx.moveTo(x, baseY); ctx.lineTo(x, baseY + 5); ctx.stroke();
      }

      const shown = Math.floor(recs.length * progress);

      // cumulative holdings — a quiet wash with a brass hairline top
      ctx.beginPath();
      ctx.moveTo(x0, baseY);
      for (let i = 0; i < shown; i++) {
        const r = recs[i];
        const h = ((i + 1) / recs.length) * plotH * 0.9;
        ctx.lineTo(xOf(r.t), baseY - h);
      }
      const lastX = shown ? xOf(recs[shown - 1].t) : x0;
      ctx.lineTo(lastX, baseY);
      ctx.closePath();
      ctx.fillStyle = "rgba(233,227,213,0.05)";
      ctx.fill();
      ctx.beginPath();
      for (let i = 0; i < shown; i++) {
        const r = recs[i];
        const h = ((i + 1) / recs.length) * plotH * 0.9;
        const X = xOf(r.t), Y = baseY - h;
        i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
      }
      ctx.strokeStyle = "rgba(182,146,79,0.5)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // emission band — one hairline per record, hue by date (matte)
      for (let i = 0; i < shown; i++) {
        const r = recs[i];
        const p = (r.t - minT) / (maxT - minT);
        const [R, G, B] = plateColor(p);
        const x = xOf(r.t);
        ctx.strokeStyle = `rgba(${R},${G},${B},0.55)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, baseY);
        ctx.lineTo(x, baseY - 16);
        ctx.stroke();
      }
      // a continuous spectral ruler on the baseline
      const grad = ctx.createLinearGradient(x0, 0, x1, 0);
      for (let s = 0; s <= 10; s++) {
        const [R, G, B] = plateColor(s / 10);
        grad.addColorStop(s / 10, `rgb(${R},${G},${B})`);
      }
      ctx.globalAlpha = 0.7 * progress;
      ctx.fillStyle = grad;
      ctx.fillRect(x0, baseY - 1, lastX - x0, 2);
      ctx.globalAlpha = 1;

      // corner brackets — the plate mount
      ctx.strokeStyle = "rgba(182,146,79,0.5)";
      ctx.lineWidth = 1.5;
      const c = 9;
      const corner = (cx, cy, dx, dy) => {
        ctx.beginPath();
        ctx.moveTo(cx + dx * c, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + dy * c);
        ctx.stroke();
      };
      corner(x0, pads.t, 1, 1); corner(x1, pads.t, -1, 1);
      corner(x0, baseY, 1, -1); corner(x1, baseY, -1, -1);
    };

    // calibration draw on first view; redraw on resize
    let start = null;
    const animate = (now) => {
      if (start == null) start = now;
      const t = Math.min(1, (now - start) / 900);
      render(t);
      if (t < 1) raf = requestAnimationFrame(animate);
    };

    const ro = new ResizeObserver(() => render(reduced ? 1 : 1));
    ro.observe(wrap);

    if (inView) {
      if (reduced) render(1);
      else raf = requestAnimationFrame(animate);
    } else {
      render(0);
    }
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [inView, reduced]);

  const onMove = (e) => {
    const { x0, x1, minT, maxT } = geomRef.current;
    const rect = wrapRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    if (mx < x0 || mx > x1) { setCursor(null); return; }
    const t = minT + ((mx - x0) / (x1 - x0)) * (maxT - minT);
    const year = new Date(t).getUTCFullYear();
    const yx = x0 + ((Date.UTC(year, 6, 1) - minT) / (maxT - minT)) * (x1 - x0);
    setCursor({ x: yx, year, count: counts[year] || 0 });
  };

  return (
    <Section id="plate" numeral="Ⅱ" kicker="Frontispiece">
      <p className="mb-5 max-w-[44ch] font-serif text-[1.45rem] italic leading-snug text-bone-dim">
        The record entire — twenty years, read at a glance.
      </p>

      <figure className="mt-2">
        <div
          ref={(el) => { wrapRef.current = el; viewRef.current = el; }}
          onMouseMove={onMove}
          onMouseLeave={() => setCursor(null)}
          className="relative h-[260px] w-full cursor-crosshair border border-rule bg-plate sm:h-[320px]"
        >
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          {/* hover read-off */}
          {cursor && (
            <>
              <span
                className="pointer-events-none absolute top-4 bottom-7 w-px bg-brass/70"
                style={{ left: cursor.x }}
              />
              <span
                className="pointer-events-none absolute top-2 -translate-x-1/2 whitespace-nowrap border border-brass/40 bg-ink px-2 py-1 font-mono text-[0.62rem] uppercase tracking-label text-bone"
                style={{ left: cursor.x }}
              >
                {cursor.year} · {cursor.count} records
              </span>
            </>
          )}
        </div>
        {/* axis */}
        <div className="mt-2 flex justify-between px-1 font-mono text-[0.6rem] tracking-wide text-graphite">
          {["2005", "2010", "2015", "2020", "2025", "2026"].map((y) => (
            <span key={y}>{y}</span>
          ))}
        </div>
        <figcaption className="mt-4 font-serif text-[0.95rem] italic text-graphite">
          <span className="mr-2 font-mono text-[0.62rem] not-italic uppercase tracking-label text-brass/80">
            Fig. 1
          </span>
          Coverage of the collection, 2005–2026. Each line, one record; hue denotes date.
        </figcaption>
      </figure>
    </Section>
  );
}
