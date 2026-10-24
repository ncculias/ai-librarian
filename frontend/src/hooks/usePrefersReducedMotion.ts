import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function read(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(QUERY).matches;
}

/** 使用者是否偏好減少動態；系統設定改變時會跟著更新。 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(read);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(QUERY);
    const onChange = () => setReduced(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
