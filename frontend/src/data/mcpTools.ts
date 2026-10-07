export type ToolArg = {
  arg: string;
  type: string;
  description: string;
  required: boolean;
};

export type Tool = {
  name: string;
  description: string; // 英文原文（保留備用）
  args_schema?: ToolArg[];
};

// 工具清單（資料陣列）
export const mcpTools: Tool[] = [
  {
    name: "日期 date_time",
    description:
      "查詢現在的日期和時間，可以告訴你「現在是幾月幾號、幾點幾分」。",
  },
  {
    name: "學術論文 arxiv",
    description:
      "找科學、數學、AI 等領域的專業論文，這個工具會幫你搜尋國外的科學論文資料庫。",
  },
  {
    name: "duckduckgo搜尋引擎",
    description: "這個工具能幫你搜尋網路上的最新消息，例如新聞或熱門話題。",
  },
  {
    name: "youtube搜尋",
    description: "輸入一個主題，它會找出Youtube中找出相關的影片",
  },
  {
    name: "NCL圖書館搜尋",
    description:
      "這個工具可以查國家圖書館（國圖）的書，它會告訴你書名、作者和連結。",
  },
  {
    name: "維基百科 wikipedia",
    description:
      "這個工具可以幫你查維基百科上的資訊，適合找人物、地點、公司、歷史事件等資料。",
  },
  {
    name: "google搜尋引擎",
    description: "用 Google 查網路資料的工具",
  },
  {
    name: "google書籍",
    description:
      "查 Google Books 的書籍資訊，若你想找某個主題的書，例如：糖尿病飲食、運動保健、旅遊書，它都能幫你找到相關的書籍推薦。",
  },
  {
    name: "天氣查詢",
    description: "這個工具可以查某個城市現在的天氣。",
  },
];

// 中文描述對照（顯示用）
// 中文描述對照（顯示用）
export const toolZhDesc: Record<string, string> = {
  date_time: "顯示地區的日期與時間。",
  arxiv:
    "用於查詢各領域，包括物理、數學、電腦科學、定量生物、定量金融、統計、電機工程、經濟學等相關的學術文章。",
  duckduckgo_results_json: "DuckDuckGo 適合查詢時事。",
  youtube_search:
    "搜尋與特定人物相關的 YouTube 影片。輸入為逗號分隔：第一段是人名，第二段是要回傳的最大筆數。",
  ncl_search:
    "國家圖書館（NCL）館藏查詢工具。回傳書名、作者與連結；語言會跟查詢一致。",
  wikipedia: "維基百科包裝器，適合查一般人物、地點、公司、事實、歷史事件等。",
  google_search: "Google 搜尋，適合查時事。",
  google_books: "Google Books 搜尋工具，可依主題找書並產生推薦。",
  open_weather_map:
    "Open-Meteo 開放天氣服務（免金鑰），可查指定城市的即時天氣與今日預報。輸入城市名稱（中文或英文皆可）。",
};
