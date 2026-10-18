import { useCallback, useEffect, useRef, useState } from "react";
import Live2DPanel from "./Live2DPanel";
import {
  checkYanruyuSupport,
  isYanruyuUrl,
  readYanruyuEnv,
} from "./live2d/yanruyu";
import {
  DEFAULT_CHARACTER_VIEW,
  type CharacterView,
  type LayoutMode,
} from "./live2d/display";

type Live2DInfo = {
  name: string;
  url: string;
  tags?: string[];
};

type Props = {
  modelUrl: string;
  setModelUrl: (url: string) => void;
  emotionToken: string | null;
  paused?: boolean;
  motionSpeed?: number; // 動作速度倍率,轉交給 Live2DPanel
  characterView?: CharacterView; // 人物顯示:全身 / 半身,轉交給 Live2DPanel
  layout?: LayoutMode; // 版面:左右並排 / 上下(人物在後)
};

// 從候選清單挑第一個 .model3.json;沒有就退而求其次
function pickModelUrl(usable: Live2DInfo[], all: Live2DInfo[]): string {
  const first = usable.find((m) => m.url.endsWith(".model3.json"));
  return first?.url ?? usable[0]?.url ?? all[0]?.url ?? "";
}

export default function Live2DArea({
  modelUrl,
  setModelUrl,
  emotionToken,
  paused = false,
  motionSpeed = 1,
  characterView = DEFAULT_CHARACTER_VIEW,
}: Props) {
  const [_models, _setModels] = useState<Live2DInfo[]>([]);
  const [yanruyuSupport, setYanruyuSupport] = useState<
    ReturnType<typeof checkYanruyuSupport>
  >({ ok: true });
  const [resizeKey, setResizeKey] = useState(0);
  // 已處理過載入失敗的 url(每個 url 只反應一次,避免退回後再失敗而無限循環)
  const failedUrlsRef = useRef<Set<string>>(new Set());

  const rebuildPanel = useCallback(() => {
    setResizeKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let timer: any = null;

    const handle = () => {
      if (timer) clearTimeout(timer);

      timer = setTimeout(() => {
        rebuildPanel();
      }, 200);
    };

    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, [rebuildPanel]);

  // 顏如玉模型檔載入失敗(缺檔等):停用顏如玉並退回第一個非顏如玉的模型
  const handleLoadError = useCallback(
    (url: string) => {
      if (failedUrlsRef.current.has(url)) return;
      failedUrlsRef.current.add(url);
      if (!isYanruyuUrl(url)) return;
      const reason = "模型檔缺失";
      setYanruyuSupport({ ok: false, reason });
      console.warn("[Live2D] 顏如玉已停用:", reason);
      const usable = _models.filter((m) => !isYanruyuUrl(m.url));
      setModelUrl(pickModelUrl(usable, _models));
    },
    [_models, setModelUrl],
  );

  // 註：以前 A+/A- 會改變整體版面，所以要監聽 font-size-change 重建面板；
  // 現在字級縮放只影響文字、不動版面（index.css 的 html 基準已固定），不需要重建，
  // 反而重建會讓模型重載、鏡頭閃到腳部。故移除該監聽。

  useEffect(() => {
    const manifestPath = "/index.json";

    fetch(manifestPath)
      .then((res) => {
        if (!res.ok) throw new Error(`Manifest ${manifestPath} ${res.status}`);
        return res.json();
      })
      .then((list: Live2DInfo[]) => {

        const normalized = list.map((m) => {
          const name = m.name.trim();
          const good =
            m.url && m.url.startsWith("/") && m.url.endsWith(".model3.json")
              ? m.url
              : `/${name}/${name}.model3.json`;
          return { ...m, url: good };
        });

        _setModels(normalized);

        const support = checkYanruyuSupport(readYanruyuEnv());
        setYanruyuSupport(support);
        if (!support.ok) {
          console.warn("[Live2D] 顏如玉已停用:", support.reason);
        }

        const usable = support.ok
          ? normalized
          : normalized.filter((m) => !isYanruyuUrl(m.url));
        setModelUrl(pickModelUrl(usable, normalized));
      })
      .catch((err) => {
        console.error("Load Live2D manifest failed:", err);
        _setModels([]);
      });
  }, [setModelUrl]);

  return (
    <section className="card p-6 md:col-span-1 h-[80vh] relative">
      <div className="theme-live2d-stage absolute inset-0 z-0 rounded-xl border border-dashed">
        {modelUrl && (
          <Live2DPanel
            key={`${modelUrl}-${resizeKey}`}
            modelUrl={modelUrl}
            className="w-full h-full"
            emotionToken={emotionToken ?? undefined}
            paused={paused}
            motionSpeed={motionSpeed}
            characterView={characterView}
            onLoadError={handleLoadError}
          />
        )}
      </div>

      <div className="absolute top-2 right-2 z-10">
        <select
          value={modelUrl}
          onChange={(e) => setModelUrl(e.target.value)}
          className="theme-input rounded-md px-2 py-1 text-[11px]"
        >
          {_models.map((m) => {
            const unsupported = !yanruyuSupport.ok && isYanruyuUrl(m.url);
            return (
              <option key={m.url} value={m.url} disabled={unsupported}>
                {unsupported ? `${m.name}(此裝置不支援)` : m.name}
              </option>
            );
          })}
        </select>
      </div>

      <div className="absolute bottom-2 right-2 z-10">
        <div className="theme-emotion-pill flex items-center gap-2 rounded-md px-2 py-1 text-[10px] backdrop-blur">
          <span className="text-[var(--color-text-secondary)]">emotion</span>
          <span className="font-mono text-[var(--color-accent-text)]">
            {emotionToken ? emotionToken : "-"}
          </span>
        </div>
      </div>
    </section>
  );
}
