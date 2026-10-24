import { useEffect, useState } from "react";
import type { RefObject } from "react";

/**
 * 回傳元素在視窗中的捲動進度 0..1：
 * (-rect.top) / (el.offsetHeight - innerHeight)，並夾在 0..1。
 * 元素高度不超過視窗時沒有可捲距離，固定回 0。
 * scroll／resize 以 requestAnimationFrame 節流。
 */
export function useScrollProgress(ref: RefObject<HTMLElement | null>): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let frame = 0;

    const compute = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const scrollable = el.offsetHeight - window.innerHeight;
      if (scrollable <= 0) {
        setProgress(0);
        return;
      }
      const raw = -el.getBoundingClientRect().top / scrollable;
      setProgress(Math.min(1, Math.max(0, raw)));
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(compute);
    };

    compute();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [ref]);

  return progress;
}
