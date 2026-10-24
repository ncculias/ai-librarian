import type { CSSProperties } from "react";
import { STORY } from "./homeContent";
import { useInView } from "../../hooks/useInView";

const WORD_CLASSES = ["w1", "w2", "w3"] as const;

// 三張拍立得的旋轉角、延遲與色塊（示意用，不是真實照片）
const POLAROIDS = [
  { r: "-6deg", delay: "0s", bg: "linear-gradient(135deg, #fbcfe8, #fde68a)" },
  { r: "3deg", delay: "0.15s", bg: "linear-gradient(135deg, #bfdbfe, #c7d2fe)" },
  { r: "-2deg", delay: "0.3s", bg: "linear-gradient(135deg, #bbf7d0, #99f6e4)" },
] as const;

/** 第三段：大字在前、半透明拍立得在後，進入視窗時浮上來。 */
export default function HomeStory() {
  const [ref, inView] = useInView<HTMLDivElement>();

  return (
    <section className="hs-story">
      {/* 三行大字只是裝飾，說明文字由下方 caption 承擔 */}
      <div className="hs-words" aria-hidden="true">
        {STORY.lines.map((line, i) => (
          <div key={line} className={`hs-serif hs-word ${WORD_CLASSES[i]}`}>
            {line}
          </div>
        ))}
      </div>

      {/* 一個容器 ref 管三張，靠 transition-delay 錯開 */}
      <div ref={ref} className={`hs-polas ${inView ? "is-on" : ""}`}>
        {POLAROIDS.map((p, i) => (
          <div
            key={STORY.polaroids[i]}
            className="hs-pola"
            style={{ "--r": p.r, transitionDelay: p.delay } as CSSProperties}
          >
            <i style={{ background: p.bg }} />
            <span className="hs-serif">{STORY.polaroids[i]}</span>
          </div>
        ))}
      </div>

      <div className="hs-cap">
        <p className="hs-cap-title">{STORY.headline}</p>
        <p className="msg-text-sm">{STORY.desc}</p>
      </div>
    </section>
  );
}
