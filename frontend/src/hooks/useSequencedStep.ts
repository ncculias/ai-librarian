import { useEffect, useRef, useState } from "react";

/**
 * 讓「步驟」一次只前進／後退一格，每格至少停留 dwellMs：
 * 快速捲動時目標可能從 0 直接跳到 3，畫面仍會依序走 1 → 2 → 3，
 * 人物左、右的過場才不會疊在一起變成閃動。
 * enabled 為 false 時（減少動態、堆疊版面）直接跟著目標走。
 */
export function useSequencedStep(target: number, dwellMs: number, enabled = true): number {
  const [current, setCurrent] = useState(target);
  const lastChange = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setCurrent(target);
      return;
    }
    if (current === target) return;
    const elapsed = performance.now() - lastChange.current;
    const wait = Math.max(0, dwellMs - elapsed);
    const id = window.setTimeout(() => {
      lastChange.current = performance.now();
      setCurrent((c) => c + Math.sign(target - c));
    }, wait);
    return () => window.clearTimeout(id);
  }, [target, current, enabled, dwellMs]);

  return enabled ? current : target;
}
