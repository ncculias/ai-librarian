import { useEffect, useRef } from "react";
import * as PIXI from "pixi.js";

// Live2DPanel 輸入參數
type Props = {
  modelUrl: string; // Live2D 模型 JSON 路徑
  className?: string;
  emotionToken?: string | null; // 用於觸發對應的表情動作
  paused?: boolean; // true 時暫停渲染（例如設定視窗開啟時，省 GPU 避免拖慢前景）
};

type PonchoPose = {
  headX: number;
  headY: number;
  headZ: number;
  bodyX: number;
  bodyY: number;
  bodyZ: number;
  bodyX2: number;
  bodyY2: number;
  bodyZ2: number;
  eyeOpen: number;
  mouthForm: number;
  lShoulder: number;
  lElbow: number;
  lWrist: number;
  lPalmX: number;
  rShoulder: number;
  rElbow: number;
  rWrist: number;
  rPalmX: number;
};

const DEFAULT_PONCHO_POSE: PonchoPose = {
  headX: 0,
  headY: 0,
  headZ: 0,
  bodyX: 0,
  bodyY: 0,
  bodyZ: 0,
  bodyX2: 0,
  bodyY2: 0,
  bodyZ2: 0,
  eyeOpen: 1,
  mouthForm: 0,
  lShoulder: 0,
  lElbow: 0,
  lWrist: 0,
  lPalmX: 0,
  rShoulder: 0,
  rElbow: 0,
  rWrist: 0,
  rPalmX: 0,
};

export default function Live2DPanel({
  modelUrl,
  className,
  emotionToken,
  paused = false,
}: Props) {
  // 外層容器參考（用於監聽尺寸）
  const containerRef = useRef<HTMLDivElement>(null);
  // canvas 參考（PIXI 渲染目標）
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 保存目前的 Live2D 模型
  const currentModelRef = useRef<any>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const ponchoPoseTargetRef = useRef<PonchoPose>({ ...DEFAULT_PONCHO_POSE });
  const ponchoPoseCurrentRef = useRef<PonchoPose>({ ...DEFAULT_PONCHO_POSE });
  const ponchoEmotionRef = useRef<string>("neutral");

  // 設定視窗等遮罩開啟時暫停動畫：背景 60fps 渲染會與前景 UI 搶資源
  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    if (paused) app.ticker.stop();
    else app.ticker.start();
  }, [paused]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas || !modelUrl) return;

    let app: PIXI.Application | null = null;
    let model: any = null;
    let ro: ResizeObserver | null = null;
    let tickFn: ((dt: number) => void) | null = null;
    let destroyed = false;

    // async/await：初始化 Pixi + 載入 Live2D
    const mount = async () => {
      try {
        // 供某些版本依賴 window.PIXI
        (window as any).PIXI = PIXI;

        // 動態載入 Live2D 模組

        const { Live2DModel } = await import("pixi-live2d-display/cubism4");

        // 建立 PIXI Application
        app = new PIXI.Application({
          view: canvas,
          autoStart: false,
          backgroundAlpha: 0,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
          width: container.clientWidth || 1,
          height: container.clientHeight || 1,
        });

        // 關閉互動管理器（避免不必要事件）
        try {
          const im = (app.renderer as any)?.plugins?.interaction;
          im?.destroy?.();
        } catch (_) {}

        app.stage.interactive = false;
        if ("eventMode" in app.stage) (app.stage as any).eventMode = "none";

        // 載入模型
        const abs = new URL(modelUrl, window.location.origin).pathname;
        const isPoncho = abs.toLowerCase().includes("/poncho/");
        model = await Live2DModel.from(abs, { autoUpdate: false });
        currentModelRef.current = model;

        if (destroyed) return;

        // 將模型加入舞台（先隱藏：載入初期 width/height 還沒就緒，
        // 直接定位會算出爆炸大的縮放、畫面只剩鞋子；等尺寸可信再亮相）
        model.visible = false;
        let revealed = false;
        app.stage.addChild(model);

        // 尺寸調整函式

        const fit = () => {
          const w = container.clientWidth || 1;
          const h = container.clientHeight || 1;
          app!.renderer.resize(w, h);

          // 用「未縮放的原始尺寸」計算（model.width 會隨 scale 變動，重複 fit 會失真）
          const baseW = model.width / (model.scale.x || 1);
          const baseH = model.height / (model.scale.y || 1);
          // 模型尺寸未就緒（載入中）就先不定位、保持隱藏，等下一幀再試
          if (!(baseW > 10 && baseH > 10)) return;

          const hasAnchor = (model as any)?.anchor?.set;
          if (hasAnchor) model.anchor.set(0.5, 1);
          else model.pivot?.set?.(baseW / 2, baseH);

          const scale = Math.min((w * 0.9) / baseW, (h * 0.95) / baseH);
          model.scale.set(scale > 0 ? scale : 0.5);
          model.position.set(w / 2, h * 0.98);
          if (!revealed) {
            revealed = true;
            model.visible = true;
          }
        };

        let elapsedSec = 0;

        tickFn = (dt: number) => {
          model.update?.(dt);

          if (isPoncho) {
            const core = model?.internalModel?.coreModel;
            if (core?.setParameterValueById) {
              elapsedSec += app!.ticker.deltaMS / 1000;

              const breathFreq = 0.24; // Hz
              const bodyFreq = 0.17; // Hz
              const phase = Math.PI / 3;

              const breath =
                0.5 + 0.5 * Math.sin(2 * Math.PI * breathFreq * elapsedSec);
              const bodySway =
                8 * Math.sin(2 * Math.PI * bodyFreq * elapsedSec + phase);
              const isSad = ponchoEmotionRef.current === "sad";
              const headSwayX = isSad
                ? 0
                : 5 * Math.sin(2 * Math.PI * 0.11 * elapsedSec);
              const headSwayY = isSad
                ? 0
                : 3 * Math.sin(2 * Math.PI * 0.13 * elapsedSec + Math.PI / 5);
              const headSwayZ = isSad
                ? 0
                : 2.5 * Math.sin(2 * Math.PI * 0.09 * elapsedSec + Math.PI / 7);
              const happyShakeZ =
                ponchoEmotionRef.current === "happy"
                  ? 9 * Math.sin(2 * Math.PI * 0.8 * elapsedSec)
                  : 0;
              const shyBodySwingZ =
                ponchoEmotionRef.current === "shy"
                  ? 6 * Math.sin(2 * Math.PI * 0.55 * elapsedSec)
                  : 0;
              const sadShoulderSwingX2 =
                ponchoEmotionRef.current === "sad"
                  ? 8 * Math.sin(2 * Math.PI * 0.42 * elapsedSec + Math.PI / 8)
                  : 0;
              const sadShoulderSwingZ2 =
                ponchoEmotionRef.current === "sad"
                  ? 6 * Math.sin(2 * Math.PI * 0.5 * elapsedSec + Math.PI / 6)
                  : 0;

              const current = ponchoPoseCurrentRef.current;
              const target = ponchoPoseTargetRef.current;
              const blend = Math.min(1, 0.08 * dt);

              current.headX += (target.headX - current.headX) * blend;
              current.headY += (target.headY - current.headY) * blend;
              current.headZ += (target.headZ - current.headZ) * blend;
              current.bodyX += (target.bodyX - current.bodyX) * blend;
              current.bodyY += (target.bodyY - current.bodyY) * blend;
              current.bodyZ += (target.bodyZ - current.bodyZ) * blend;
              current.bodyX2 += (target.bodyX2 - current.bodyX2) * blend;
              current.bodyY2 += (target.bodyY2 - current.bodyY2) * blend;
              current.bodyZ2 += (target.bodyZ2 - current.bodyZ2) * blend;
              current.eyeOpen += (target.eyeOpen - current.eyeOpen) * blend;
              current.mouthForm +=
                (target.mouthForm - current.mouthForm) * blend;
              current.lShoulder +=
                (target.lShoulder - current.lShoulder) * blend;
              current.lElbow += (target.lElbow - current.lElbow) * blend;
              current.lWrist += (target.lWrist - current.lWrist) * blend;
              current.lPalmX += (target.lPalmX - current.lPalmX) * blend;
              current.rShoulder +=
                (target.rShoulder - current.rShoulder) * blend;
              current.rElbow += (target.rElbow - current.rElbow) * blend;
              current.rWrist += (target.rWrist - current.rWrist) * blend;
              current.rPalmX += (target.rPalmX - current.rPalmX) * blend;

              const setParam = (id: string, value: number) => {
                try {
                  core.setParameterValueById(id, value);
                } catch (_) {}
              };

              setParam("ParamBreath", breath);
              setParam("ParamBodyAngleX", bodySway + current.bodyX);
              setParam("ParamBodyAngleY", current.bodyY);
              setParam("ParamBodyAngleZ", current.bodyZ + shyBodySwingZ);
              setParam("ParamBodyAngleX2", current.bodyX2 + sadShoulderSwingX2);
              setParam("ParamBodyAngleY2", current.bodyY2);
              setParam("ParamBodyAngleZ2", current.bodyZ2 + sadShoulderSwingZ2);
              setParam("ParamAngleX", headSwayX + current.headX);
              setParam("ParamAngleY", headSwayY + current.headY);
              setParam("ParamAngleZ", headSwayZ + current.headZ + happyShakeZ);
              setParam("ParamEyeLOpen", current.eyeOpen);
              setParam("ParamEyeROpen", current.eyeOpen);
              setParam("ParamMouthForm", current.mouthForm);

              // 只在需要手動姿勢時覆蓋手臂，避免把 Physics 的手臂揺れ蓋掉
              const manualArmPose =
                ponchoEmotionRef.current === "angry" ||
                ponchoEmotionRef.current === "anger";
              if (manualArmPose) {
                setParam("Lkata", current.lShoulder);
                setParam("Lhiji", current.lElbow);
                setParam("Ltekubi", current.lWrist);
                setParam("LtenohiraX", current.lPalmX);
                setParam("Rkata", current.rShoulder);
                setParam("Rhiji", current.rElbow);
                setParam("Rtekubi", current.rWrist);
                setParam("RtenohiraX", current.rPalmX);
              }
            }
          }
        };
        app.ticker.add(tickFn);

        ro = new ResizeObserver(() => fit());
        ro.observe(container);

        // 連續補正尺寸（避免初始化時尺寸未確定）

        const repeatFit = () => {
          let count = 0;
          const max = 60; // 最多重試約 1 秒：模型亮相（revealed）後再多校幾幀就收手
          const loop = () => {
            fit();
            count++;
            if (count < max && !(revealed && count >= 10)) requestAnimationFrame(loop);
          };
          loop();
        };
        repeatFit();

        appRef.current = app;
        app.start();
      } catch (_) {}
    };

    mount();

    // 清除資源
    return () => {
      destroyed = true;

      try {
        ro?.disconnect();
      } catch (_) {}

      try {
        tickFn && app?.ticker?.remove?.(tickFn);
      } catch (_) {}

      try {
        app?.stage?.removeChildren();
        model?.destroy?.();
      } catch (_) {}

      try {
        const im = (app?.renderer as any)?.plugins?.interaction;
        im?.destroy?.();
      } catch (_) {}

      try {
        app?.destroy?.(true, { children: true });
      } catch (_) {}
    };
  }, [modelUrl]);

  useEffect(() => {
    const model = currentModelRef.current;
    if (!model || !emotionToken) return;

    const isPoncho = modelUrl.toLowerCase().includes("/poncho/");
    if (isPoncho) {
      const ponchoExpressionMap: Record<string, string> = {
        neutral: "三つ編み",
        happy: "pero",
        angry: "aozame",
        anger: "puku",
        sad: "悲しみ",
        surprised: "kirari",
        shy: "cheek",
      };
      const ponchoPoseMap: Record<string, PonchoPose> = {
        neutral: { ...DEFAULT_PONCHO_POSE },
        happy: {
          ...DEFAULT_PONCHO_POSE,
          headX: 4,
          headY: 2,
          headZ: -4,
          bodyX: 3,
          bodyZ: -1,
          eyeOpen: 0.95,
          mouthForm: 0.7,
        },
        angry: {
          ...DEFAULT_PONCHO_POSE,
          headX: -5,
          headZ: 5,
          bodyX: -10,
          bodyY: 4,
          bodyZ: 8,
          bodyX2: -10,
          bodyY2: 8,
          bodyZ2: 5,
          eyeOpen: 0.75,
          mouthForm: -0.7,
          lShoulder: 20,
          lElbow: 30,
          lWrist: -12,
          lPalmX: 12,
          rShoulder: -20,
          rElbow: -30,
          rWrist: 12,
          rPalmX: -12,
        },
        anger: {
          ...DEFAULT_PONCHO_POSE,
          headX: -3,
          headY: -1,
          headZ: 7,
          bodyX: -8,
          bodyY: 3,
          bodyZ: 6,
          bodyX2: -14,
          bodyY2: 6,
          bodyZ2: 10,
          eyeOpen: 0.8,
          mouthForm: -0.6,
          lShoulder: 16,
          lElbow: 24,
          lWrist: -10,
          lPalmX: 10,
          rShoulder: -16,
          rElbow: -24,
          rWrist: 10,
          rPalmX: -10,
        },
        sad: {
          ...DEFAULT_PONCHO_POSE,
          headX: -16,
          headY: -6,
          headZ: -1,
          bodyX: -2,
          bodyY: -3,
          bodyZ: -2,
          bodyX2: 4,
          bodyZ2: 3,
          eyeOpen: 0.6,
          mouthForm: -0.9,
        },
        surprised: {
          ...DEFAULT_PONCHO_POSE,
          headX: 2,
          headY: 5,
          bodyX: 2,
          bodyY: 2,
          bodyZ: 1,
          mouthForm: 1.0,
        },
        shy: {
          ...DEFAULT_PONCHO_POSE,
          headX: -2,
          headY: -3,
          headZ: -5,
          bodyX: -1,
          bodyY: -1,
          bodyZ: -1,
          eyeOpen: 0.7,
          mouthForm: 0.3,
        },
      };

      const expName = ponchoExpressionMap[emotionToken];
      if (!expName) return;
      ponchoEmotionRef.current = emotionToken;
      ponchoPoseTargetRef.current = ponchoPoseMap[emotionToken] ?? {
        ...DEFAULT_PONCHO_POSE,
      };
      try {
        if (typeof model.expression === "function") {
          model.expression(expName);
        }
      } catch (_) {}
      return;
    }

    const emotionMap: Record<string, { group: string; index: number }> = {
      happy: { group: "TapBody", index: 6 },
      sad: { group: "TapBody", index: 3 },
      angry: { group: "TapBody", index: 1 },
      anger: { group: "TapBody", index: 2 },
      surprised: { group: "TapBody", index: 4 },
      neutral: { group: "TapBody", index: 5 },
    };

    const mapping = emotionMap[emotionToken];
    if (!mapping) return;

    try {
      model.motion(mapping.group, mapping.index);
    } catch (_) {}
  }, [emotionToken]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minWidth: 100,
        minHeight: 100,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
        }}
      />
    </div>
  );
}
