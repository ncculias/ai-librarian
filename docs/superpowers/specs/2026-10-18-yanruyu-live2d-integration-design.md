# 顏如玉 Live2D 角色整合 — 設計文件

日期:2026-10-18
狀態:已確認(2026-10-18)

## 1. 目的

把廠商(李安瑟羅有限公司)交付的 Live2D 模型「顏如玉」接進 AI Librarian 的聊天頁面,成為預設角色,並讓她的表情與動作跟著後端回傳的情緒變化。這是專案第一個客製角色;之後其他角色(Haru、Poncho、Mia)可能不再使用,但本次不移除。

為什麼現在做:10/16 教育訓練已過,下一階段要讓系統有自己的角色形象;後續「語音對話模式」(盲人/長者受眾)也要建立在這個角色上。

## 2. 目標、非目標、反目標

### 目標
- 聊天頁載入時預設顯示顏如玉,待機時播放她的 normal 動作(活著的感覺,不是靜止圖)
- 後端回傳情緒時,顏如玉的臉、嘴、手臂表情與身體動作同步切換到對應情緒
- 回答結束後停留在該情緒,下一題再依新情緒切換
- 使用者仍可從下拉選單切回舊角色,舊角色行為不變
- 廠商交付的原始檔(PSD、完稿圖、規格文件)**不得**出現在可公開下載的位置

### 非目標(本次不做)
- 對嘴 / 嘴型同步(留給語音對話模式)
- think(思考)情緒的使用——檔案照常登記,但流程中不觸發
- 滑鼠/視線追蹤(模型用自訂參數名,引擎的追蹤本來就不會作用,不另外實作)
- 移除舊角色
- 貼圖降解析度(等廠商提供 4096 版本;見 §7 風險)

### 反目標(做出來會算失敗)
- 眨眼或呼吸出現「雙重作用」(動作裡已內建,引擎再疊一層會變成抽搐)
- 切換情緒時動作硬切、畫面抽動
- 臉已經換成開心、身體還停在上一個動作好幾秒
- 在手機/平板上顯示空白卻沒有任何提示(貼圖過大造成)

## 3. 現況

- 前端用 `pixi-live2d-display` 0.4.0 + `pixi.js` 6.5.8 渲染 Live2D(Cubism 4 執行階段,Core 可讀 moc3 v5——Poncho 即為 v5 且在正式環境運作正常)
- 角色清單由 `frontend/public/index.json` 提供,`Live2DArea.tsx` 讀取後產生下拉選單,第一筆即預設角色
- 情緒流:後端 SSE `emotion` 事件 → `useLLMStream` 的 `onEmotion` → `Librarian.tsx` 的 `emotionToken` state → `Live2DPanel.tsx` 的 `useEffect([emotionToken])`
- `Live2DPanel.tsx` 內的情緒處理是**逐角色寫死**的:Poncho 一段(手動驅動參數)、其餘角色一段(Haru 風格:`model.motion("TapBody", index)`)
- 後端情緒集合:`neutral / happy / angry / anger / sad / surprised`(`ai_librarian_core/agents/react/state.py`)
- 廠商檔案目前放在 `frontend/public/顏如玉/`(尚未納入 git)

## 4. 廠商交付物分析(已完成)

| 項目 | 狀態 |
|---|---|
| `AI-Librarian.moc3`(v5)、`cdi3.json`、`physics3.json`、`model3.json` | 齊全 |
| 貼圖 `AI-Librarian.8192/texture_00.png`(8192×8192,31MB) | 齊全,但尺寸風險見 §7 |
| 表情 19 個:arm×5、face×5、mouth×5、cloth×4(全部 Blend=Add) | 齊全,**未登記**在 model3.json |
| 動作 5 個:normal/happy/angry/sad/think(全部 Loop=true,6–12 秒) | 齊全,**未登記**在 model3.json |
| `motionsync3.json`(AIUEO 嘴型) | 本次用不到(引擎無 MotionSync 外掛) |
| `integration_spec.json/html`、規格 txt、`ico_AI-Librarian.jpg`、`圖/`(PSD 31MB、完稿 jpg/png) | 非執行所需;授權條款禁止對外散布 |

廠商規格的要點(`integration_spec.json`):
- 一個情緒 = 同時套用 arm + face + mouth 三個表情檔 + 播一個動作檔
- 表情立即切換;動作等目前播放中的動作播完才開始
- **要求關閉** physics、眨眼、呼吸(已內建於動作 keyframe)
- 淡入淡出 0 秒 = 硬切
- 參數範圍要從模型讀取,不可假設 0~1

參數命名為自訂風格(`PARAM_HEAD_X`、`PARAM_MOUTH_OPEN`…),與引擎預期的標準名(`ParamAngleX`、`ParamMouthOpenY`)不同。

## 5. 設計決定

### 5.1 檔案整理(我的決定)

- 執行所需檔案搬到 `frontend/public/yanruyu/`,檔名改為 ASCII、無空格與括號。建議結構:
  ```
  yanruyu/
    yanruyu.model3.json          ← 我們自己寫的(見 5.2)
    yanruyu.moc3
    yanruyu.cdi3.json
    yanruyu.physics3.json        ← 保留檔案但 model3.json 不參照
    textures/texture_00.png
    motions/normal.motion3.json, happy…, angry…, sad…, think…
    expressions/normal.exp3.json, happy…, angry…, sad…, think…   ← 合併後的檔(見 5.3)
    vendor-expressions/arm/…, face/…, mouth/…, cloth/…             ← 廠商原始表情檔,改名後保留備查
  ```
- 廠商整包原始交付(含 PSD、完稿圖、規格文件、`motionsync3.json`、`ico`)搬到 repo **外**:`/Users/weihsuan/ai-librarian-assets/yanruyu-vendor-20261018/`,原樣保存不改名。
- `frontend/public/顏如玉/` 整理完後刪除。
- Git(**使用者決定:選項 A,模型不進 git**):`frontend/public/yanruyu/` 加入 `.gitignore`;模型以 rsync 經 SSH 同步到正式環境的 `~/ai-librarian/frontend/public/yanruyu/`(容器以 volume 掛載,放進去即生效);repo 外備份在 `/Users/weihsuan/ai-librarian-assets/`。合併表情的**腳本**與 `index.json` 仍進 git(不含模型資料)。背景:`ncculias/ai-librarian` 與 `aihailab/ai-librarian` 都是**公開** repo,而廠商授權明文「不得轉售、轉授權或對外散布本文件及模型資料」;把 moc3/貼圖/動作推上公開 repo 等於永久公開散布(可被 clone/fork,歷史難以抹除)。既有角色是 Live2D 官方範例,授權不同,不能類比。PSD 與完稿圖無論如何**不 commit**。
- `index.json`:顏如玉放第一筆(成為預設),既有三筆保留在後面。

### 5.2 model3.json 登記(我的決定)

自行撰寫 `yanruyu.model3.json`:
- `Moc`、`Textures`、`DisplayInfo` 照廠商原檔
- **不寫** `Physics`(廠商要求關閉;引擎不參照就不會啟用)
- `Groups`:保留 `LipSync`(未來語音模式用),**移除 `EyeBlink` 群組**或在載入後把引擎的 eyeBlink 設為 undefined——兩者擇一由實作者決定,目標是引擎不自動眨眼
- `Expressions`:登記 5 個合併表情(名稱 `normal / happy / angry / sad / think`)
- `Motions`:每個情緒各自一個群組,群組名與情緒相同,各含一個動作檔;另設 `Idle` 群組指向 normal 動作

### 5.3 表情合併(我的決定)

廠商要求一個情緒同時套三個表情檔,引擎一次只掛一個表情。由於 15 個檔案的 Blend 全部是 Add,且 arm/face/mouth 三組之間唯一重疊的參數只在 arm 與 face 之間(眉毛、眼睛笑容共 10 個參數),合併方式:
- 同一情緒的 arm + face + mouth 參數合併成一個 exp3.json
- 重疊參數的 Value **相加**(與三個表情同時 Add 疊加的結果等價)
- `FadeInTime` / `FadeOutTime` 一律設為 0(硬切)。**我的決定,理由**:廠商規格中 arm 與 mouth 為 0 秒,face 為 0.2–0.5 秒不等,三者合併成一個檔只能取一個值。引擎在表情切換時新舊表情權重相加不為 1,開關型參數(手臂切換、嘴型切換)只要有淡入淡出就會出現兩組手臂/兩種嘴形重疊的鬼影,比臉部硬切更傷;且情緒只在兩次回答之間切換、不在說話途中切,臉部硬切的觀感成本很低。日後若要保留臉部淡入淡出,需自行寫逐幀內插的小型表情層,列為未來改善。
- 合併由**腳本產生**(不手寫),腳本放在 `frontend/scripts/` 並進 repo,廠商日後更新表情檔時可重跑
- cloth 類別(頭髮、蝴蝶結、識別證、外套)是廠商測試用,不合併、不觸發

廠商規格的「expression-manager-per-slot」約束(每個表情類別各自一個 manager)因此不適用——合併後只有一個表情生效,語意等價。

### 5.4 情緒對應與播放規則

| 後端情緒 | 顏如玉表情+動作 | 備註 |
|---|---|---|
| neutral | normal | 待機 |
| happy | happy | |
| angry、anger | angry | 兩個名字對同一組 |
| sad | sad | |
| surprised | **happy**(我的決定) | 廠商未提供驚訝;驚訝多為正面語境 |
| (未送) | think | 本次不觸發,檔案照常登記 |

播放規則(**使用者決定**):
1. 待機:normal 動作循環
2. 問題送出後不做任何動作變化;後端 `emotion` 事件到達時,表情與動作切到對應情緒
3. 回答結束後停留在該情緒,不回到 normal
4. 下一題送出後,等新的 `emotion` 事件再切換
5. 同一情緒連續出現(例如連兩題都 happy)不重新觸發,維持現狀

切換細節(我的決定,**偏離廠商規格**):
- 引擎 0.4.0 不讀動作檔的 `Meta.Loop`,動作播完(6–12 秒)會回到 Idle 群組;同優先度的新動作會被拒,切換時需用 FORCE 優先度。(審查者查證,供實作者參考)
- 廠商要求「新動作等目前動作播完」。但 5 個動作全是循環、永遠不會播完,照做會造成臉已換、身體卡在舊動作最長 12 秒。改為**立即切換 + 0.5 秒淡入淡出**,達成規格想避免的「不硬切」效果。
- 表情依規格立即切換(0 秒淡入淡出)。
- 動作需持續循環:引擎對非 Idle 群組的動作播完即回 Idle。實作者可採用「切換情緒時同步把引擎的 idle 群組改為該情緒群組」的方式讓它自然循環;或其他等價做法。

### 5.5 執行期效果(依廠商規格)

- 眨眼:關閉(見 5.2)
- 呼吸:引擎的呼吸只作用在標準參數名,對本模型無效;實作時仍明確關閉以免未來引擎升級後行為改變
- 物理:關閉(不登記 Physics)
- 視線追蹤:引擎只作用在標準參數名,對本模型無效,不處理

### 5.6 程式結構(我的決定)

- `Live2DPanel.tsx` 新增顏如玉分支(以 modelUrl 包含 `/yanruyu/` 判斷),與 Poncho 分支並列;不重構既有分支
- **允許一處共用修改(我的決定)**:`Live2DArea` 在視窗 resize 後會整個重建 `Live2DPanel`(手機捲動時網址列伸縮就會觸發),重建後模型尚未載入完成時情緒套用不到,角色會回到 normal、右下角卻仍顯示原情緒——這會讓驗收第 4 點在手機上失敗。修法:`Live2DPanel` 以 ref 記住最後一次 `emotionToken`,模型載入完成後重新套用一次;此修改對所有角色生效且無副作用。`Live2DArea` 的 resize 重建邏輯本身**不動**(它是歷史上修「鏡頭閃到腳部」的補丁);重建帶來的重新載入成本,待 4096 貼圖到位後自然降低。
- 顏如玉分支內容:載入後關閉眨眼/呼吸;`emotionToken` 變化時查對應表,呼叫 `model.expression(name)` 與動作切換
- 情緒對應表與路徑常數集中在一個設定物件,方便日後調整
- 舊角色路徑完全不動

## 6. 驗收方式

本機(`localhost:3100`)與正式環境各驗一次:
1. 開啟聊天頁,預設顯示顏如玉,待機有 normal 動作(頭髮飄、呼吸感),**不眨眼兩次、不抽搐**
2. 問一題引出 happy:臉、嘴、手臂、動作同步變開心;動作切換有淡入淡出
3. 連問引出 sad、angry、neutral:各自正確;neutral 回到 normal
4. 回答結束後角色停留在該情緒至少 30 秒不變
5. 下拉切到 Haru 再切回顏如玉:兩者都正常
6. 瀏覽器 Console 無 Live2D 相關錯誤
7. `https://ai-librarian-ai.com/yanruyu/` 底下找不到 PSD、完稿圖、規格文件;`顏如玉/` 路徑已不存在;GitHub 上任何分支都找不到 moc3/貼圖/動作檔
8. 手機(或模擬行動裝置)開啟:不白屏,預設顯示 Haru,選單中顏如玉標示不支援

## 7. 風險與待辦

- **8192 貼圖**:解壓後約 256MB 顯示記憶體,許多手機/平板/舊筆電的貼圖上限是 4096,會顯示空白;首次載入要下載約 43MB。已請使用者向廠商索取 4096 版本。在拿到之前:本次照原檔整合,並加一個**退回機制(我的決定)**:
  - 條件:`MAX_TEXTURE_SIZE < 8192` **或**判定為行動裝置(觸控且視窗寬 < 1024,或 `navigator.deviceMemory ≤ 4`)。只看 `MAX_TEXTURE_SIZE` 不夠——iOS Safari 多半回報 ≥ 8192,但 8192² 貼圖含 mipmap 約 340MB 顯示記憶體,實際會讓分頁崩潰或白屏。
  - 行為:預設角色退回 Haru;下拉選單中顏如玉**保留但停用**,文字標示「(此裝置不支援)」,避免使用者手選後白屏;Console 記錄原因。
  - 位置:偵測放在 `Live2DArea`(它同時掌握預設角色與選單)。
  - 4096 貼圖到位後,行動裝置條件移除,只保留 `MAX_TEXTURE_SIZE` 檢查。
- 廠商授權:「修改後之表現不在原始交付驗收範圍內」。本設計未修改 moc3/貼圖/動作,僅合併表情檔與改檔名;若日後向廠商驗收,需說明此點。
- 與廠商規格的偏離只有一處:動作切換改為立即淡入淡出(5.4)。
- `think` 與對嘴保留給語音對話模式(另案設計)。

## 8. 留給實作者的

- 合併表情的腳本語言與形式(Node 或 Python 皆可)
- 淡入淡出 0.5 秒的實現方式(改動作檔的 `Meta.FadeInTime`,或呼叫引擎 API)
- 動作持續循環的具體機制(5.4 提供一種做法)
- 關閉眨眼的具體方式(5.2 提供兩種)
- `MAX_TEXTURE_SIZE` 偵測的位置與退回邏輯

## 9. 使用者決定紀錄

1. **模型檔的存放與部署方式**:選 **(A)**(2026-10-18)。選項供日後參考:
   - (A) 模型不進 git:`frontend/public/yanruyu/` 加入 `.gitignore`,模型以 rsync 經 SSH 直接同步到正式環境,repo 外另存一份備份。優點:公開 repo 乾淨、不違反授權;缺點:多一個部署步驟,新機器要另外拿模型。
   - (B) 改推私有 repo(`AI-NCCU-Lab/ai-librarian` 是 private),正式環境改從它拉。優點:一切照舊流程;缺點:要調整部署來源,且 ncculias 公開 repo 就不能再是主線。
   - (C) 照樣推公開 repo。**不建議**——違反廠商授權條款。
