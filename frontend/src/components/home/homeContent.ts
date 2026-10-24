// 首頁捲動敘事的文案與步驟規則。純資料與純函式，不可引入 React／DOM，才能被 node 測試直接載入。

export type HomeEntry = {
  key: "chat" | "book-guide" | "story-book";
  no: "01" | "02" | "03";
  title: string;
  /** 第四段索引列的一句話 */
  short: string;
  /** 第二段釘住介紹的整句說明 */
  long: string;
  /** 連結文字 */
  go: string;
  to: "/librarian" | "/book-guide" | "/my-story-book";
};

export const HOME_ENTRIES: readonly HomeEntry[] = [
  {
    key: "chat",
    no: "01",
    title: "聊天問答",
    short: "問問題、查館藏、查天氣",
    long: "直接問她：「有沒有關於台灣鳥類的書？」「今天台北天氣？」她會查館藏、查資料，再用好懂的話回答。",
    go: "進入聊天問答 →",
    to: "/librarian",
  },
  {
    key: "book-guide",
    no: "02",
    title: "書籍介紹",
    short: "說書名或主題，整理一本書的介紹",
    long: "說一個書名或主題，她整理成書名、作者、出版、主題、摘要，還能念給你聽。",
    go: "進入書籍介紹 →",
    to: "/book-guide",
  },
  {
    key: "story-book",
    no: "03",
    title: "繪本生成",
    short: "上傳照片，做成有聲故事書",
    long: "上傳 3～10 張照片，她看圖寫成一本前後連貫的故事書，一頁一頁翻、一頁一頁念。",
    go: "進入繪本生成 →",
    to: "/my-story-book",
  },
];

// 第一段（Hero）
export const HERO = {
  lines: ["圖書館", "AI 館員", "顏如玉"],
  headline: "讓 AI 館員陪你找書、聽故事",
  tagline: "Unlock knowledge, powered by AI.",
  desc: "查館藏、介紹書籍，或把你的照片做成一本有聲故事書。",
  badge: { big: "24 小時都在", small: "問問題、查館藏、聽故事" },
  hint: "往下捲 ↓",
} as const;

// 第三段（照片變故事書）
export const STORY = {
  lines: ["把照片", "變成", "一本故事書"],
  polaroids: ["初秋的清晨", "珍貴的瞬間", "心中的回憶"],
  headline: "約 20 秒，一本有聲故事書",
  desc: "照片先在你的裝置上縮圖，再由 AI 看圖寫故事、真人語音朗讀。",
} as const;

/** 釘住區的捲動進度門檻：進度達到門檻就進入下一步 */
export const STAGE_STEPS = [0.12, 0.42, 0.72] as const;

/**
 * 人像位置的關鍵影格：[捲動進度, 水平位移 vw, 縮放]。
 * 兩點之間線性內插，相鄰兩點數值相同就是「頓點」。完全由捲動位置決定、沒有計時器：
 * 使用者停手畫面就停，滑多快動多快；左右互換前一定先回中間停一段。
 */
export const STAGE_POSE_KEYFRAMES: readonly (readonly [number, number, number])[] = [
  [0, 0, 1],
  [0.12, 0, 1], // 步驟 1 開始才動
  [0.2, 14, 1.04], // 往右
  [0.34, 14, 1.04], // 右邊停
  [0.38, 0, 1], // 回中間
  [0.42, 0, 1], // 中間停（步驟 2 開始）
  [0.5, -14, 1.04], // 往左
  [0.64, -14, 1.04], // 左邊停
  [0.68, 0, 1], // 回中間
  [0.72, 0, 1], // 中間停（步驟 3 開始）
  [0.8, 12, 1.02], // 往右
  [1, 12, 1.02],
];

/** 捲動進度 → 人像位置（線性內插）；NaN／超出範圍夾到 0..1 */
export function stagePoseAt(p: number): { x: number; scale: number } {
  const t = Number.isNaN(p) ? 0 : Math.min(1, Math.max(0, p));
  const k = STAGE_POSE_KEYFRAMES;
  for (let i = 1; i < k.length; i++) {
    const [p0, x0, s0] = k[i - 1];
    const [p1, x1, s1] = k[i];
    if (t <= p1) {
      const r = p1 === p0 ? 1 : (t - p0) / (p1 - p0);
      return { x: x0 + (x1 - x0) * r, scale: s0 + (s1 - s0) * r };
    }
  }
  const [, x, scale] = k[k.length - 1];
  return { x, scale };
}

/** stagePoseAt 的 CSS transform 字串 */
export function stagePoseTransform(p: number): string {
  const { x, scale } = stagePoseAt(p);
  return `translateX(${x.toFixed(2)}vw) scale(${scale.toFixed(3)})`;
}

/** 捲動進度 0..1 → 步驟 0..3；門檻含下界（剛好 0.12 即進入步驟 1）；NaN 與負值視為 0 */
export function stepFromProgress(p: number): 0 | 1 | 2 | 3 {
  if (!(p >= STAGE_STEPS[0])) return 0; // NaN、負值與未達第一道門檻都落在這裡
  if (p < STAGE_STEPS[1]) return 1;
  if (p < STAGE_STEPS[2]) return 2;
  return 3;
}
