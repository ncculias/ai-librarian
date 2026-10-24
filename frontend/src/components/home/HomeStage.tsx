import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { YANRUYU_PORTRAIT_URL } from "../live2d/yanruyu";
import { HOME_ENTRIES, STAGE_CENTER_PAUSE_MS, STAGE_DWELL_MS, STAGE_POSES, stepFromProgress } from "./homeContent";
import { useInView } from "../../hooks/useInView";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { useScrollProgress } from "../../hooks/useScrollProgress";
import { useSequencedStep } from "../../hooks/useSequencedStep";

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
  const target = stepFromProgress(progress);
  const reduced = usePrefersReducedMotion();
  const stacked = useStacked();
  // 步驟一格一格走：快速捲動時人物也會左停一下、右停一下，不會把過場疊成閃動；減少動態與堆疊版面不排隊
  const step = useSequencedStep(target, STAGE_DWELL_MS, !(reduced || stacked));
  // 人物姿勢：左右互換（例如 1→2 是右→左）時先回中間停一下，再滑到定位，讓每一步都有頓點
  const [pose, setPose] = useState<string>(STAGE_POSES[step]);
  const prevStep = useRef(step);
  useEffect(() => {
    const from = prevStep.current;
    prevStep.current = step;
    if (from === step) return;
    const viaCenter = from >= 1 && step >= 1;
    if (!viaCenter) {
      setPose(STAGE_POSES[step]);
      return;
    }
    setPose(STAGE_POSES[0]);
    const id = window.setTimeout(() => setPose(STAGE_POSES[step]), STAGE_CENTER_PAUSE_MS);
    return () => window.clearTimeout(id);
  }, [step]);
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
            style={{ transform: reduced || stacked ? undefined : pose }}
          />
        )}

        {HOME_ENTRIES.map(renderCall)}

        <div className="hs-counter hs-serif" aria-hidden="true">
          <b>0{Math.max(1, step)}</b>/03
        </div>
      </div>
    </section>
  );
}
