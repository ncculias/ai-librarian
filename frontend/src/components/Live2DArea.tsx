import { useCallback, useEffect, useState } from "react";
import Live2DPanel from "./Live2DPanel";

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
};

export default function Live2DArea({
  modelUrl,
  setModelUrl,
  emotionToken,
  paused = false,
}: Props) {
  const [_models, _setModels] = useState<Live2DInfo[]>([]);
  const [resizeKey, setResizeKey] = useState(0);

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

        const first = normalized.find((m) => m.url.endsWith(".model3.json"));
        setModelUrl(first?.url ?? normalized[0]?.url ?? "");
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
          />
        )}
      </div>

      <div className="absolute top-2 right-2 z-10">
        <select
          value={modelUrl}
          onChange={(e) => setModelUrl(e.target.value)}
          className="theme-input rounded-md px-2 py-1 text-[11px]"
        >
          {_models.map((m) => (
            <option key={m.url} value={m.url}>
              {m.name}
            </option>
          ))}
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
