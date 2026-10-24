import { useEffect, useRef } from "react";
import { HERO } from "./homeContent";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";

const LINE_CLASSES = ["l1", "l2", "l3"] as const;

/** 第一段：三行大字依序滑入，往下捲時淡出上移。 */
export default function HomeHero() {
  const bigRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const el = bigRef.current;
    if (!el) return;
    // 減少動態：不綁捲動，大字保持原樣
    if (reduced) {
      el.style.opacity = "";
      el.style.transform = "";
      return;
    }

    let raf = 0;
    const update = () => {
      raf = 0;
      const p = Math.min(1, window.scrollY / window.innerHeight);
      el.style.opacity = String(Math.max(0, 1 - p * 1.2));
      el.style.transform = `translateY(${-60 * p}px)`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return (
    <section className="hs-hero">
      <div className="hs-blob a" />
      <div className="hs-blob b" />
      <div className="hs-glow" />

      <div className="hs-big" ref={bigRef}>
        {HERO.lines.map((line, i) => (
          <div key={line} className={`hs-serif hs-line ${LINE_CLASSES[i]}`}>
            {line}
          </div>
        ))}
      </div>

      <div className="hs-sub">
        <b>{HERO.headline}</b>
        <div className="msg-text-sm">{HERO.tagline}</div>
        <div className="msg-text">{HERO.desc}</div>
      </div>

      <div className="hs-badge">
        {HERO.badge.big}
        <small>{HERO.badge.small}</small>
      </div>

      <div className="hs-hint">{HERO.hint}</div>
    </section>
  );
}
