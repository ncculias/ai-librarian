// 顏如玉 Live2D 角色的純設定/純函式模組。
// 除 readYanruyuEnv() 外不碰 DOM、不依賴 React。

export const YANRUYU_PATH = "/yanruyu/";
export const YANRUYU_MODEL_URL = "/yanruyu/yanruyu.model3.json";

export function isYanruyuUrl(url: string): boolean {
  return url.toLowerCase().includes(YANRUYU_PATH);
}

export type YanruyuEmotion = "normal" | "happy" | "angry" | "sad" | "think";

// 後端情緒 token -> 顏如玉五種情緒。
// think 已登記於型別但無任何 token 觸發;未知 token 一律忽略。
const EMOTION_MAP: Record<string, YanruyuEmotion> = {
  neutral: "normal",
  happy: "happy",
  angry: "angry",
  anger: "angry",
  sad: "sad",
  surprised: "happy",
};

export function mapEmotion(token: string | null | undefined): YanruyuEmotion | null {
  if (!token) return null;
  return Object.hasOwn(EMOTION_MAP, token) ? EMOTION_MAP[token] : null;
}

export function shouldApply(prev: YanruyuEmotion | null, next: YanruyuEmotion | null): boolean {
  return next !== null && next !== prev;
}

export interface YanruyuEnv {
  maxTextureSize: number | null;
  isTouch: boolean;
  innerWidth: number;
  deviceMemory: number | undefined;
}

export function checkYanruyuSupport(env: YanruyuEnv): { ok: true } | { ok: false; reason: string } {
  if (env.maxTextureSize === null) return { ok: false, reason: "無 WebGL" };
  if (env.maxTextureSize < 8192) {
    return { ok: false, reason: `貼圖上限 ${env.maxTextureSize} < 8192` };
  }
  if (env.isTouch && env.innerWidth < 1024) {
    return { ok: false, reason: "行動裝置(待 4096 貼圖)" };
  }
  if (env.deviceMemory !== undefined && env.deviceMemory <= 4) {
    return { ok: false, reason: `裝置記憶體 ${env.deviceMemory}GB <= 4GB` };
  }
  return { ok: true };
}

// 瀏覽器環境專用,不做單元測試。
export function readYanruyuEnv(): Parameters<typeof checkYanruyuSupport>[0] {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  const maxTextureSize = gl ? (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) : null;
  return {
    maxTextureSize,
    isTouch: navigator.maxTouchPoints > 0,
    innerWidth: window.innerWidth,
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
  };
}
