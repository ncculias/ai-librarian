import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { YANRUYU_PORTRAIT_URL } from "../live2d/yanruyu";
import { HOME_ENTRIES, STAGE_POSES, stepFromProgress } from "./homeContent";
import { useInView } from "../../hooks/useInView";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { useScrollProgress } from "../../hooks/useScrollProgress";

const STACKED_QUERY = "(max-width: 1023px)";

/** 堆疊斷點：與 home.css 第二段的 1023px 區塊一致（頂欄在 lg 以下會折行，釘住的 3.5rem 位移不成立） */
function useStacked(): boolean {
  const [stacked, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(STACKED_QUERY).matches,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(STACKED_QUERY);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return stacked;
}

/** 第二段：寬螢幕上顏如玉釘在視窗，捲動時三個功能標註依序亮起；窄螢幕不釘住，改成進入視窗時一起浮現。 */
export default function HomeStage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const progress = useScrollProgress(wrapRef);
  const step = stepFromProgress(progress);
  const reduced = usePrefersReducedMotion();
  const stacked = useStacked();
  const [stageRef, inView] = useInView<HTMLDivElement>();
  const [portraitOk, setPortraitOk] = useState(true);

  // 標註是否顯示：窄螢幕看是否進入視窗；桌機依捲動步驟（減少動態也一樣，只是轉場由 CSS 關掉、直接跳狀態）。
  // 人物圖載入失敗時沒有主視覺撐場，第一個標註從步驟 0 就顯示，避免 hero 後出現整面空白
  const shown = (n: number) =>
    stacked ? inView : (!portraitOk && n === 1) || step >= n;

  const renderCall = (e: (typeof HOME_ENTRIES)[number], i: number) => {
    // 連結文字尾端的箭頭只是裝飾，拆出來對輔助科技隱藏（資料維持「進入X →」）
    const arrowAt = e.go.lastIndexOf(" →");
    const goText = arrowAt >= 0 ? e.go.slice(0, arrowAt) : e.go;
    return (
      <div key={e.key} className={`hs-call c${i + 1}${shown(i + 1) ? " is-on" : ""}`}>
        {/* 圓點＋連線；c2 靠右對齊，桌機用 row-reverse 讓圓點在最右 */}
        <div className="hs-mark" aria-hidden="true">
          <span className="hs-dot" />
          <span className="hs-ln" />
        </div>
        <h2 className="hs-serif">{e.title}</h2>
        <p className="msg-text-sm">{e.long}</p>
        <Link to={e.to} className="hs-go">
          {goText}
          {arrowAt >= 0 && <span aria-hidden="true">{e.go.slice(arrowAt)}</span>}
        </Link>
      </div>
    );
  };

  return (
    <section ref={wrapRef} className="hs-stage-wrap" aria-label="三個功能">
      <div ref={stageRef} className={`hs-stage${portraitOk ? "" : " no-portrait"}`}>
        {portraitOk && (
          <img
            src={YANRUYU_PORTRAIT_URL}
            alt="AI 館員顏如玉"
            width={1120}
            height={1600}
            draggable={false}
            loading="lazy"
            decoding="async"
            onError={() => setPortraitOk(false)}
            style={{ transform: reduced || stacked ? undefined : STAGE_POSES[step] }}
          />
        )}

        {/* 標註 1、3 同在左欄，放進同一個欄容器，字級放大時才不會互相重疊；2 在右側獨立 */}
        <div className="hs-call-col">
          {renderCall(HOME_ENTRIES[0], 0)}
          {renderCall(HOME_ENTRIES[2], 2)}
        </div>
        {renderCall(HOME_ENTRIES[1], 1)}

        <div className="hs-counter hs-serif" aria-hidden="true">
          <b>0{Math.max(1, step)}</b>/03
        </div>
      </div>
    </section>
  );
}
