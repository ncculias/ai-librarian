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

/** 各步驟主視覺（人像）的位置與縮放，索引對應 stepFromProgress 的回傳值 */
// 人物依步驟左右讓位；步驟由 useSequencedStep 一格一格走，快速捲動也會「左停一下、右停一下」
export const STAGE_POSES = [
  "translateX(0) scale(1)",
  "translateX(14vw) scale(1.04)",
  "translateX(-14vw) scale(1.04)",
  "translateX(12vw) scale(1.02)",
] as const;
/** 每個步驟至少停留的毫秒數（含 0.6s 過場 + 看得見的停頓） */
export const STAGE_DWELL_MS = 900;

/** 捲動進度 0..1 → 步驟 0..3；門檻含下界（剛好 0.12 即進入步驟 1）；NaN 與負值視為 0 */
export function stepFromProgress(p: number): 0 | 1 | 2 | 3 {
  if (!(p >= STAGE_STEPS[0])) return 0; // NaN、負值與未達第一道門檻都落在這裡
  if (p < STAGE_STEPS[1]) return 1;
  if (p < STAGE_STEPS[2]) return 2;
  return 3;
}
