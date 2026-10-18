// 朗讀口型的音源(瀏覽器專用,依賴 Web Audio,不做單元測試)。
//
// 兩個重點:
// 1. createMediaElementSource() 對同一個 <audio> 元素只能呼叫一次,第二次會丟例外,
//    所以用 WeakMap 以元素為鍵快取 analyser;元素被回收時快取一併釋放。
// 2. 一旦把元素接進 Web Audio,原本的直接輸出就被接管,聲音只會走我們建的節點鏈。
//    所以 analyser 必須再接到 ctx.destination,否則朗讀會完全無聲。
import { fakeMouthAt, mouthFromRms, rmsOf } from "./lipsync";
import type { MouthSource } from "./lipsync";

let ctx: AudioContext | null = null;

const cache = new WeakMap<
  HTMLMediaElement,
  { analyser: AnalyserNode; buffer: Float32Array<ArrayBuffer> }
>();

// 在使用者手勢內預先建立/喚醒 AudioContext(Safari 只允許在手勢內建立或 resume)。
// 朗讀流程要先 await 網路請求才 play(),手勢早已結束,所以得在點擊當下先呼叫。
// 失敗一律吞掉,後續會退回假口型。
export function warmUpAudioContext(): void {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  } catch {
    // 無法建立 AudioContext:交給 getAnalyserMouthSource 丟例外、由呼叫端退回假口型
  }
}

// 取得該音訊元素的音量音源;失敗時直接丟例外,由呼叫端退回假口型。
export function getAnalyserMouthSource(audio: HTMLMediaElement): MouthSource {
  if (!ctx) ctx = new AudioContext();
  const c = ctx;
  // 瀏覽器自動播放政策可能讓 context 一開始是 suspended
  if (c.state === "suspended") c.resume().catch(() => {});

  let entry = cache.get(audio);
  if (!entry) {
    // 元素一旦接進 Web Audio,聲音就只走我們的節點鏈;若 context 不是 running
    // (例如 Safari 手勢外建立、仍卡在 suspended),接進去會讓朗讀整個無聲。
    // 所以尚未接線時先檢查,不行就丟例外,讓元素保持直接輸出、口型退回假口型。
    if (c.state !== "running") {
      throw new Error(`AudioContext 狀態為 ${c.state},不接管音訊輸出`);
    }
    const node = c.createMediaElementSource(audio);
    const analyser = c.createAnalyser();
    analyser.fftSize = 1024;
    node.connect(analyser);
    analyser.connect(c.destination); // 必接,否則聲音會被吞掉
    entry = { analyser, buffer: new Float32Array(analyser.fftSize) };
    cache.set(audio, entry);
  }

  const { analyser, buffer } = entry;
  return {
    level() {
      if (audio.paused) return 0;
      analyser.getFloatTimeDomainData(buffer);
      return mouthFromRms(rmsOf(buffer));
    },
  };
}

// 假口型:沒有可用音訊(analyser 建立失敗等)時,以時間驅動的正弦動嘴。
export function createFakeMouthSource(
  now: () => number = () => performance.now(),
): MouthSource {
  const start = now();
  return {
    level() {
      return fakeMouthAt(now() - start);
    },
  };
}
