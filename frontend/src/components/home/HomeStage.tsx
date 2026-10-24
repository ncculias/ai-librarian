import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { YANRUYU_PORTRAIT_URL } from "../live2d/yanruyu";
import { HOME_ENTRIES, STAGE_POSES, stepFromProgress } from "./homeContent";
import { useInView } from "../../hooks/useInView";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { useScrollProgress } from "../../hooks/useScrollProgress";

const MOBILE_QUERY = "(max-width: 767px)";

/** 手機斷點：與 home.css 的 767px 區塊一致 */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}

/** 第二段：桌機上顏如玉釘在視窗，捲動時三個功能標註依序亮起；手機不釘住，改成進入視窗時一起浮現。 */
export default function HomeStage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const progress = useScrollProgress(wrapRef);
  const step = stepFromProgress(progress);
  const reduced = usePrefersReducedMotion();
  const isMobile = useIsMobile();
  const [stageRef, inView] = useInView<HTMLDivElement>();
  const [portraitOk, setPortraitOk] = useState(true);

  // 標註是否顯示：手機看是否進入視窗；減少動態一律顯示；桌機依捲動步驟
  const shown = (n: number) => (isMobile ? inView : reduced ? true : step >= n);

  return (
    <section ref={wrapRef} className="hs-stage-wrap" aria-label="三個功能">
      <div ref={stageRef} className={`hs-stage${portraitOk ? "" : " no-portrait"}`}>
        {portraitOk && (
          <img
            src={YANRUYU_PORTRAIT_URL}
            alt="AI 館員顏如玉"
            draggable={false}
            loading="eager"
            onError={() => setPortraitOk(false)}
            style={{ transform: reduced || isMobile ? undefined : STAGE_POSES[step] }}
          />
        )}

        {HOME_ENTRIES.map((e, i) => (
          <div key={e.key} className={`hs-call c${i + 1}${shown(i + 1) ? " is-on" : ""}`}>
            {/* 圓點＋連線；c2 靠右對齊，桌機用 row-reverse 讓圓點在最右 */}
            <div className="hs-mark" aria-hidden="true">
              <span className="hs-dot" />
              <span className="hs-ln" />
            </div>
            <h3 className="hs-serif">{e.title}</h3>
            <p className="msg-text-sm">{e.long}</p>
            <Link to={e.to} className="hs-go">
              {e.go}
            </Link>
          </div>
        ))}

        <div className="hs-counter hs-serif" aria-hidden="true">
          <b>0{Math.max(1, step)}</b>/03
        </div>
      </div>
    </section>
  );
}
