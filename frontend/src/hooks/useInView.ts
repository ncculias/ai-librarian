import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

/**
 * 元素進入視窗（達到 threshold 比例）後回傳 true，且進入一次後保持 true。
 * 沒有 IntersectionObserver 的舊環境直接視為已進入。
 */
export function useInView<T extends HTMLElement>(threshold = 0.25): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.unobserve(el);
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return [ref, inView];
}
