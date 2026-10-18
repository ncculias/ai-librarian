// 朗讀時的口型同步純函式模組(RMS 音量 → 嘴巴開合、平滑、假口型)。
// 純函式、不碰 DOM / Web Audio。

// 低於此 RMS 視為靜音,嘴巴保持閉合。
export const LIPSYNC_THRESHOLD = 0.02;
// RMS 超過門檻後的放大倍率。
export const LIPSYNC_GAIN = 8;
// 每幀朝目標值逼近的比例(越小越平滑)。
export const LIPSYNC_SMOOTHING = 0.35;
// 嘴巴開合低於此值視為閉合(用於判斷是否需要繼續更新)。
export const MOUTH_REST_EPSILON = 0.005;

// 每幀回傳目標開合 0..1(未平滑)。
export type MouthSource = { level(): number };

// 均方根(RMS);空陣列回 0。
export function rmsOf(samples: ArrayLike<number>): number {
  const n = samples.length;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / n);
}

// RMS → 目標開合,限制在 0..1。
export function mouthFromRms(rms: number): number {
  const v = (rms - LIPSYNC_THRESHOLD) * LIPSYNC_GAIN;
  return Math.min(1, Math.max(0, v));
}

// 指數平滑:朝目標逼近一步。
export function smoothMouth(prev: number, target: number): number {
  return prev + (target - prev) * LIPSYNC_SMOOTHING;
}

// 無音訊時的假口型(兩個不同頻率的正弦疊加),值域 0..1。
export function fakeMouthAt(tMs: number): number {
  const t = tMs;
  return (
    (0.5 + 0.5 * Math.sin((2 * Math.PI * 3.5 * t) / 1000)) *
    (0.55 + 0.45 * Math.sin((2 * Math.PI * 0.6 * t) / 1000))
  );
}
