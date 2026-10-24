# 顏如玉朗讀口型同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按「朗讀」時顏如玉的嘴巴隨 Gemini TTS 音量開合；退回瀏覽器語音時用假口型；停止/結束即閉上。

**Architecture:** 純計算（RMS、音量→開合、平滑、假口型）在 `live2d/lipsync.ts` 並以 node test 鎖住；瀏覽器音源（Web Audio AnalyserNode、假口型計時）在 `live2d/lipsyncSources.ts`；`Live2DPanel` 以 ref 接收 `MouthSource`，每幀在 `model.update()` 後寫 `PARAM_MOUTH_OPEN`（僅顏如玉）；`Librarian.tsx` 在朗讀開始/結束時切換 `mouthSource` state。

**Tech Stack:** React 19 + TypeScript、Web Audio API、pixi-live2d-display 0.4（Cubism 4 `coreModel.setParameterValueById`）；測試 `node --experimental-strip-types --test`。

**Spec:** `docs/superpowers/specs/2026-10-18-yanruyu-lipsync-design.md`

## Global Constraints

- 常數：`LIPSYNC_THRESHOLD = 0.02`、`LIPSYNC_GAIN = 8`、`LIPSYNC_SMOOTHING = 0.35`、`MOUTH_REST_EPSILON = 0.005`、假口型 `3.5Hz` 開合 × `0.6Hz` 包絡（`0.55 + 0.45·sin`）。實作時 THRESHOLD/GAIN/SMOOTHING 可在 0.01–0.05 / 4–12 / 0.2–0.5 內微調，須在 commit 訊息註明最終值。
- 嘴巴參數 Id 固定 `"PARAM_MOUTH_OPEN"`；只對顏如玉（`isYanruyuUrl`）寫入；舊角色程式碼一行不改。
- 寫入時機：tick 中 `model.update()` 之後（與 Poncho 手動參數同一位置）。無音源且已閉上（`mouth <= MOUTH_REST_EPSILON`）時不寫入。
- `mouthSource` 走 ref（仿 `motionSpeedRef`），改變不得重建 PIXI app / 重載模型；`Live2DArea` 的 `key` 不含它。
- `createMediaElementSource` 每個 element 只能一次 → `WeakMap` 快取；analyser 必須接 `destination`。
- 每個任務結尾 `cd frontend && npx tsc -b && npm test` 乾淨；tsconfig 有 `noUnusedLocals`/`noUnusedParameters`。
- 瀏覽器驗證網址 `http://localhost:3100/librarian`（Docker dev server 熱更新）。Gemini TTS 免費額度每分鐘 3 次、每天 10 次：同一則回覆有快取，驗證時重播同一則，不要狂按不同則。
- 註解中文。

## Review Focus

1. Gemini 音檔播到一半按「停止」→ 嘴巴須在約 0.2 秒內平滑閉上，不可停在半開。（Task 2 tick 的「無音源仍收口」分支；Task 3 瀏覽器驗證 3）
2. 兩次朗讀連續（第一則還在播就按第二則）→ 同一個 `<audio>` 被重用，analyser 不得重複建立、不得丟 `InvalidStateError`。（Task 2 `WeakMap` 快取；Task 3 瀏覽器驗證 4）
3. Gemini 失敗退回瀏覽器語音 → 嘴巴仍要動（假口型），結束後閉上。（Task 3 驗證 5：用 DevTools 把 `/v1/story-book/speak` 設為離線/封鎖）
4. 切到 Haru 時朗讀 → Haru 不受影響、無 console 錯誤。（Task 3 驗證 6）
5. `AudioContext` 建立失敗或 `suspended` 無法 resume → 退回假口型、`console.warn` 一次，聲音仍正常。（Task 2 `getAnalyserMouthSource` try/catch；Task 3 Librarian try/catch）

---

### Task 1: `lipsync.ts` 純函式模組

**Files:**
- Create: `frontend/src/components/live2d/lipsync.ts`
- Test: `frontend/src/components/live2d/lipsync.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const LIPSYNC_THRESHOLD: number;   // 0.02
  export const LIPSYNC_GAIN: number;        // 8
  export const LIPSYNC_SMOOTHING: number;   // 0.35
  export const MOUTH_REST_EPSILON: number;  // 0.005
  export type MouthSource = { level(): number }; // 每幀回傳目標開合 0..1(未平滑)
  export function rmsOf(samples: ArrayLike<number>): number;
  export function mouthFromRms(rms: number): number;          // clamp((rms-THRESHOLD)*GAIN, 0, 1)
  export function smoothMouth(prev: number, target: number): number; // prev + (target-prev)*SMOOTHING
  export function fakeMouthAt(tMs: number): number;           // 0..1
  ```

- [ ] **Step 1: 寫失敗測試**（檔頭同 `display.test.ts`：`node:test` + `node:assert/strict`，import 加 `.ts`）

```ts
test("rmsOf", () => {
  assert.equal(rmsOf([]), 0);
  assert.equal(rmsOf([0, 0, 0]), 0);
  assert.equal(rmsOf([1, -1, 1, -1]), 1);
  assert.ok(Math.abs(rmsOf([0.5, -0.5]) - 0.5) < 1e-12);
});

test("mouthFromRms 門檻與增益", () => {
  assert.equal(mouthFromRms(0), 0);
  assert.equal(mouthFromRms(LIPSYNC_THRESHOLD), 0);
  assert.equal(mouthFromRms(1), 1);
  const mid = LIPSYNC_THRESHOLD + 0.5 / LIPSYNC_GAIN;
  assert.ok(Math.abs(mouthFromRms(mid) - 0.5) < 1e-12);
  assert.equal(mouthFromRms(-1), 0);
});

test("smoothMouth 逼近目標、停在目標", () => {
  assert.equal(smoothMouth(0, 1), LIPSYNC_SMOOTHING);
  assert.equal(smoothMouth(1, 1), 1);
  const back = smoothMouth(1, 0);
  assert.ok(back < 1 && back > 0);
});

test("fakeMouthAt 值域 0..1 且會變化", () => {
  const samples = Array.from({ length: 200 }, (_, i) => fakeMouthAt(i * 10));
  assert.ok(samples.every((v) => v >= 0 && v <= 1));
  assert.ok(Math.max(...samples) - Math.min(...samples) > 0.5);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd frontend && node --experimental-strip-types --test src/components/live2d/lipsync.test.ts`
Expected: FAIL（module not found）

- [ ] **Step 3: 實作 `lipsync.ts`**

照 Interfaces 與 Global Constraints 的算式。`fakeMouthAt(t)` = `(0.5 + 0.5·sin(2π·3.5·t/1000)) · (0.55 + 0.45·sin(2π·0.6·t/1000))`。檔頭一行說明：純函式、不碰 DOM / Web Audio。

- [ ] **Step 4: 跑測試確認通過**

Run: 同 Step 2 → 4 pass；再 `cd frontend && npm test` 全綠。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/live2d/lipsync.ts frontend/src/components/live2d/lipsync.test.ts
git commit -m "feat(live2d): lip-sync helpers (rms, mouth mapping, smoothing, fake mouth)"
```

---

### Task 2: 瀏覽器音源模組 + Live2DPanel 寫入嘴巴參數

**Files:**
- Create: `frontend/src/components/live2d/lipsyncSources.ts`
- Modify: `frontend/src/components/Live2DPanel.tsx:14-22`（Props）、`:116-142`（解構與 ref）、`:292-298`（tick，`model.update()` 之後、`if (isPoncho)` 之前）
- Modify: `frontend/src/components/Live2DArea.tsx:21-27`（Props）、`:43`（解構）、`:141-148`（傳給 Live2DPanel）

**Interfaces:**
- Consumes: Task 1 全部 export。
- Produces:
  ```ts
  // lipsyncSources.ts(瀏覽器專用,不做單元測試)
  export function getAnalyserMouthSource(audio: HTMLMediaElement): MouthSource; // 失敗時 throw
  export function createFakeMouthSource(now?: () => number): MouthSource;
  ```
  - `Live2DPanel` / `Live2DArea` Props 新增 `mouthSource?: MouthSource | null`（預設 `null`）。

- [ ] **Step 1: `lipsyncSources.ts`**

- 模組層級 `let ctx: AudioContext | null`，`const cache = new WeakMap<HTMLMediaElement, { analyser: AnalyserNode; buffer: Float32Array }>()`。
- `getAnalyserMouthSource(audio)`：取/建 `ctx`（`new AudioContext()`）；`ctx.state === "suspended"` 就 `void ctx.resume()`；cache 沒有就 `ctx.createMediaElementSource(audio)` → `analyser`（`fftSize = 1024`）→ `ctx.destination`，存入 cache；回傳 `{ level() { if (audio.paused) return 0; analyser.getFloatTimeDomainData(buffer); return mouthFromRms(rmsOf(buffer)); } }`。任何例外往上丟（呼叫端退回假口型）。
- `createFakeMouthSource(now = () => performance.now())`：記 `start = now()`，`level()` = `fakeMouthAt(now() - start)`。
- 檔頭註解說明 `createMediaElementSource` 一次性與必接 destination 的原因。

- [ ] **Step 2: `Live2DPanel` 接收並每幀寫入**

- Props 加 `mouthSource?: MouthSource | null;`（`import type { MouthSource } from "./live2d/lipsync"`），解構預設 `null`；`const mouthSourceRef = useRef(mouthSource); mouthSourceRef.current = mouthSource;`。
- 主 effect 內宣告 `let mouth = 0;`（模型重建即歸零）。tick 中 `model.update?.(elapsed);` 之後加：

```ts
if (speedApplies) { // 顏如玉:朗讀口型
  const src = mouthSourceRef.current;
  if (src || mouth > MOUTH_REST_EPSILON) {
    mouth = smoothMouth(mouth, src ? src.level() : 0);
    if (!src && mouth <= MOUTH_REST_EPSILON) mouth = 0;
    try { model.internalModel?.coreModel?.setParameterValueById?.("PARAM_MOUTH_OPEN", mouth); } catch (_) {}
  }
}
```
（`speedApplies` 已等於 `isYanruyuUrl(abs)`；若覺得名稱誤導可另宣告 `const isYanruyu = speedApplies` 使用。）

- [ ] **Step 3: `Live2DArea` 透傳**

Props 加 `mouthSource?: MouthSource | null;`，解構預設 `null`，`<Live2DPanel mouthSource={mouthSource} />`。

- [ ] **Step 4: 型別檢查與測試**

Run: `cd frontend && npx tsc -b && npm test`。Expected: 乾淨。

- [ ] **Step 5: 瀏覽器煙霧測試（接線前的最低確認）**

載入 `http://localhost:3100/librarian`，console 無新錯誤、顏如玉待機動作正常（這一步只確認沒有把模型弄壞；口型要到 Task 3 才看得到）。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/live2d/lipsyncSources.ts frontend/src/components/Live2DPanel.tsx frontend/src/components/Live2DArea.tsx
git commit -m "feat(live2d): mouth-open driver for 顏如玉 from a MouthSource (analyser or fake)"
```

---

### Task 3: Librarian 接線 + 端到端驗證

**Files:**
- Modify: `frontend/src/pages/Librarian.tsx:329-331`（state）、`:333-353`（`speakWithBrowserVoice`）、`:355-397`（`speakMessage`）、`:451-470`（`stopVoice`）、`:504-512`（`<Live2DArea>`）

**Interfaces:**
- Consumes: Task 2 `getAnalyserMouthSource`、`createFakeMouthSource`；Task 1 `MouthSource` 型別；`Live2DArea` 的 `mouthSource` prop。

- [ ] **Step 1: state 與傳遞**

`const [mouthSource, setMouthSource] = useState<MouthSource | null>(null);`，`<Live2DArea mouthSource={mouthSource} />`。

- [ ] **Step 2: 朗讀開始/結束切換音源**

- `speakMessage`：`await audio.play()` 成功後：
  ```ts
  try { setMouthSource(getAnalyserMouthSource(audio)); }
  catch (e) { console.warn("[lipsync] 無法建立音訊分析，改用假口型", e); setMouthSource(createFakeMouthSource()); }
  ```
  `done` 內加 `setMouthSource(null)`。
- `speakWithBrowserVoice`：`window.speechSynthesis.speak(utterance)` 之後 `setMouthSource(createFakeMouthSource())`；`done` 內 `setMouthSource(null)`。
- `stopVoice`：加 `setMouthSource(null)`。
- 既有的 unmount cleanup 不需改（元件卸載 state 隨之消失）。

- [ ] **Step 3: 型別檢查與測試**

Run: `cd frontend && npx tsc -b && npm test`。Expected: 乾淨。

- [ ] **Step 4: 瀏覽器驗證**（顏如玉、左右並排；注意 Gemini 額度，重播同一則）

1. 對開場句按「朗讀」→ 聲音出來時嘴巴跟著開合，語句停頓時閉上；播完閉上。用 `javascript_tool` 每 100ms 讀 `coreModel.getParameterValueById("PARAM_MOUTH_OPEN")`（透過 `document.querySelector("canvas")` 無法直接拿到 model，改為在 Live2DPanel 暫時 `console.debug` 亦可，但 commit 前移除）或直接截圖數張觀察。
2. 半身模式再播一次 → 同樣會動。
3. 播到一半按「停止」→ 嘴巴約 0.2 秒內閉上（Review Focus 1）。
4. 第一則播放中直接按另一則的「朗讀」→ 無 console 錯誤（特別是 `InvalidStateError`），新語音正常、口型正常（Review Focus 2）。
5. DevTools 把 `/v1/story-book/speak` 封鎖後按朗讀 → toast 提示退回內建語音、嘴巴以假口型開合、結束閉上（Review Focus 3）。解除封鎖。
6. 切到 Haru 按朗讀 → 聲音正常、Haru 不變、無 console 錯誤（Review Focus 4）。
7. 聽感：若嘴巴幾乎不開或一直全開，在允許範圍內調 `LIPSYNC_THRESHOLD / GAIN / SMOOTHING`（Task 1 檔案），commit 訊息註明最終值。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Librarian.tsx frontend/src/components/live2d/lipsync.ts
git commit -m "feat(chat): 顏如玉 lip-sync while reading replies aloud (analyser for Gemini audio, fake mouth for browser voice)"
```
