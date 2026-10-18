# 顏如玉朗讀口型同步設計

日期：2026-10-18
分支：`feat/yanruyu-live2d`
前置：顏如玉整合（情緒動作）、聊天朗讀（Gemini TTS + 瀏覽器語音備援）皆已完成。

## 1. 意圖

按下回覆的「朗讀」時，顏如玉的嘴巴跟著聲音開合，讓視障者的陪伴者與長者看到
「館員在講話」。使用者（老師）早先在整合顏如玉時就提過這個需求，當時待定。

## 2. 目標 / 非目標

目標
- Gemini TTS 音檔播放時，以實際音量驅動嘴巴開合：聲音大張得大、停頓時閉上。
- 退回瀏覽器內建語音（`speechSynthesis`，拿不到音訊流）時，用假口型：講話期間
  規律開合，結束就閉上。
- 按「停止」、播放結束、切頁、換角色時嘴巴歸零，不殘留半開。
- 不影響現有待機動作、情緒動作與表情；不重載模型。

非目標
- 只套用顏如玉；舊角色（Haru / Poncho / Mia）不動。
- 故事書頁（MyStoryBook）沒有角色，不處理。
- 不做母音口型（A/I/U/E/O），只用開合一個參數。

## 3. 嘴巴參數

廠商模型的 `yanruyu.cdi3.json` 有 `PARAM_MOUTH_OPEN`（0 閉 → 1 全開），我們產生的
`yanruyu.model3.json` 已把它登記在 `Groups.LipSync`。廠商的動作檔與表情檔都沒有寫
這個參數（表情只切嘴型部件的不透明度），所以每幀直接寫入不會和動作打架。

## 4. 音量 → 嘴巴

純函式模組 `frontend/src/components/live2d/lipsync.ts`（可單元測試）：

- `rmsOf(samples)`：時域樣本（-1..1）的均方根。
- `mouthFromRms(rms)`：`clamp((rms - LIPSYNC_THRESHOLD) * LIPSYNC_GAIN, 0, 1)`，
  `LIPSYNC_THRESHOLD = 0.02`（低於此視為靜音）、`LIPSYNC_GAIN = 8`。
- `smoothMouth(prev, target)`：`prev + (target - prev) * LIPSYNC_SMOOTHING`，
  `LIPSYNC_SMOOTHING = 0.35`（每幀逼近 35%，約 0.1 秒追上，避免抖動）。
- `fakeMouthAt(tMs)`：假口型，週期性開合 `0.5 + 0.5 * sin(2π · 3.5Hz · t)` 再乘上
  慢速包絡 `0.55 + 0.45 * sin(2π · 0.6Hz · t)`，值域 0..1。
- `MOUTH_REST_EPSILON = 0.005`：低於此視為已閉上，停止寫入參數。
- `type MouthSource = { level(): number }`：每幀回傳目標開合（0..1，未平滑）。

## 5. 音源（瀏覽器專用，不做單元測試）

`frontend/src/components/live2d/lipsyncSources.ts`：

- `getAnalyserMouthSource(audio: HTMLMediaElement): MouthSource`
  - 以 `WeakMap<HTMLMediaElement, {analyser, buffer}>` 快取：`createMediaElementSource`
    同一個 element 只能呼叫一次，而聊天頁重複使用同一個 `<audio>`。
  - 單一模組層級 `AudioContext`，第一次用時才建立；若 `state === "suspended"` 呼叫
    `resume()`（朗讀由按鈕觸發，已有使用者互動）。
  - `source → analyser → destination`（一定要接 destination，否則沒聲音）。
    `analyser.fftSize = 1024`，`level()` 用 `getFloatTimeDomainData` 取樣後
    `mouthFromRms(rmsOf(buffer))`。
  - `audio.paused` 時 `level()` 回 0。
- `createFakeMouthSource(now = () => performance.now()): MouthSource`：
  `level()` = `fakeMouthAt(now() - start)`。

## 6. 接線

- `Live2DPanel` 新 prop `mouthSource?: MouthSource | null`，走 ref（同 `motionSpeedRef`），
  tick 中在 `model.update()` 之後、只對顏如玉：
  - 有音源：`mouth = smoothMouth(mouth, source.level())`，寫 `PARAM_MOUTH_OPEN`。
  - 音源為 null 但 `mouth > MOUTH_REST_EPSILON`：目標 0 繼續平滑收口並寫入。
  - 已閉上且無音源：不寫入（讓模型回到原本狀態）。
  - 模型重建時 `mouth` 歸零。
- `Live2DArea` 透傳 `mouthSource`。
- `Librarian.tsx`：`mouthSource` state（`MouthSource | null`）：
  - `speakMessage` 的 `audio.play()` 成功後 `setMouthSource(getAnalyserMouthSource(audio))`；
    建立失敗（例外）就退回 `createFakeMouthSource()`。
  - `speakWithBrowserVoice` 在 `speak()` 後 `setMouthSource(createFakeMouthSource())`。
  - 兩邊的 `done` 與 `stopVoice` 都 `setMouthSource(null)`。
  - 傳給 `<Live2DArea mouthSource={mouthSource}>`。

## 7. 留給實作者

- `LIPSYNC_THRESHOLD / GAIN / SMOOTHING` 要聽著實際 Gemini 音檔調（起點如上），
  在 0.01–0.05 / 4–12 / 0.2–0.5 內微調即可，測試用常數符號不需改。
- AudioContext 在某些瀏覽器需要使用者手勢；朗讀按鈕已是手勢，若仍 suspended 就
  退回假口型並 `console.warn` 一次。
