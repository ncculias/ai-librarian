import type { CSSProperties } from "react";
import { STORY } from "./homeContent";
import { useInView } from "../../hooks/useInView";

const WORD_CLASSES = ["w1", "w2", "w3"] as const;

// 三張拍立得的旋轉角、延遲與照片。
// 照片來自 Unsplash（免費授權，可商用、不需署名），檔案放在 public/home/，已縮到 720px：
// 1. photos/elderly-man-reads-newspaper-under-autumn-tree-arzv_sYd0Do
// 2. photos/elderly-couple-sitting-on-a-park-bench-vDmCL9hKTRE
// 3. photos/person-opening-photo-album-displaying-grayscale-photos-73OJLcahQHg
const POLAROIDS = [
  { r: "-6deg", delay: "0s", src: "/home/story-1.jpg" },
  { r: "3deg", delay: "0.15s", src: "/home/story-2.jpg" },
  { r: "-2deg", delay: "0.3s", src: "/home/story-3.jpg" },
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

      {/* 一個容器 ref 管三張，靠 transition-delay 錯開；拍立得是裝飾，對輔助科技隱藏 */}
      <div ref={ref} className={`hs-polas ${inView ? "is-on" : ""}`} aria-hidden="true">
        {POLAROIDS.map((p, i) => (
          <div
            key={STORY.polaroids[i]}
            className="hs-pola"
            style={{ "--r": p.r, transitionDelay: p.delay } as CSSProperties}
          >
            <img src={p.src} alt="" width={180} height={220} loading="lazy" decoding="async" draggable={false} />
            <span className="hs-serif">{STORY.polaroids[i]}</span>
          </div>
        ))}
      </div>

      <div className="hs-cap">
        <h2 className="hs-cap-title">{STORY.headline}</h2>
        <p className="msg-text-sm">{STORY.desc}</p>
      </div>
    </section>
  );
}
