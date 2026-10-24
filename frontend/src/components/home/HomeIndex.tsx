import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { HOME_ENTRIES, INDEX_HEAD } from "./homeContent";
import { useInView } from "../../hooks/useInView";

// hover 時浮出的色塊，三行各一組（示意用）
const PEEKS = [
  "linear-gradient(135deg, #dbeafe, #bfdbfe)",
  "linear-gradient(135deg, #fde68a, #fbcfe8)",
  "linear-gradient(135deg, #bbf7d0, #99f6e4)",
] as const;

/** 第四段：編輯排版風格的三行入口，整行都是連結。 */
export default function HomeIndex() {
  const [listRef, inView] = useInView<HTMLDivElement>();

  return (
    <section className="hs-index">
      <div className="hs-index-head">
        <div>
          <div className="hs-eyebrow">{INDEX_HEAD.eyebrow}</div>
          <h2 className="hs-serif">{INDEX_HEAD.title}</h2>
        </div>
        <p className="hs-lead msg-text-sm">{INDEX_HEAD.lead}</p>
      </div>

      <div ref={listRef} className="hs-index-list">
        {HOME_ENTRIES.map((e, i) => (
          <Link
            key={e.key}
            to={e.to}
            className={`hs-row ${inView ? "is-on" : ""}`}
            style={{ transitionDelay: `${i * 0.1}s` }}
          >
            <span className="hs-no hs-serif">{e.no}</span>
            <div className="hs-ttl">
              <h3 className="hs-serif">{e.title}</h3>
              <p className="msg-text-sm">{e.short}</p>
            </div>
            <span className="hs-ico" aria-hidden="true">
              <ArrowRight size={22} strokeWidth={1.6} />
            </span>
            <span className="hs-peek" aria-hidden="true">
              <i style={{ background: PEEKS[i] }} />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
