/* 下載對話（spec：docs/2026-10-07_下載對話_spec.md）
   聊天問答與繪本陪聊共用的匯出邏輯：純前端組檔、Blob 觸發下載，
   對話資料不經過伺服器。 */

export type ExportMessage = {
  role: "user" | "assistant";
  content: string;
  /** 訊息產生時間（毫秒時間戳）；舊訊息可能沒有 */
  ts?: number;
};

export type ExportOptions = {
  /** 「對話資訊」裡的頁面名稱，例如「聊天問答」 */
  page: string;
  /** 「對話資訊」的其餘列（標籤、值），例如 [["AI 人設", "溫暖陪伴型"]] */
  info: [string, string][];
  speakers: { user: string; assistant: string };
  messages: ExportMessage[];
  /** 放在「對話資訊」之後、對話之前的內容（繪本頁用：故事全文） */
  preamble?: string;
  /** 檔名前綴，例如「AI館員對話」→ AI館員對話_2026-10-07_1432.txt */
  filePrefix: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

const formatDateTime = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

const formatClock = (ts?: number) => {
  if (!ts) return "";
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

function infoBlock(opts: ExportOptions, now: Date): string {
  const lines = [
    "═══ 對話資訊 ═══",
    `日期時間：${formatDateTime(now)}`,
    `頁面：${opts.page}`,
    ...opts.info.map(([label, value]) => `${label}：${value}`),
    `訊息數：${opts.messages.length} 句`,
  ];
  return lines.join("\n");
}

export function buildTxt(opts: ExportOptions, now: Date = new Date()): string {
  const parts: string[] = [infoBlock(opts, now)];
  if (opts.preamble) parts.push(opts.preamble.trim());
  const dialog = opts.messages
    .map((m) => {
      const who = m.role === "user" ? opts.speakers.user : opts.speakers.assistant;
      const clock = formatClock(m.ts);
      return `${who}：${m.content}${clock ? `\n（${clock}）` : ""}`;
    })
    .join("\n\n");
  parts.push(dialog);
  return parts.join("\n\n") + "\n";
}

/** csv 欄位跳脫：含逗號、引號、換行就包雙引號；內容換行壓成空格方便 Excel 閱讀 */
const csvCell = (value: string) => {
  const flat = value.replace(/\r?\n/g, " ");
  return /[",]/.test(flat) ? `"${flat.replace(/"/g, '""')}"` : flat;
};

export function buildCsv(opts: ExportOptions, now: Date = new Date()): string {
  const rows: string[] = [];
  // 「對話資訊」放表格上方的註解列（# 開頭）
  rows.push(...infoBlock(opts, now).split("\n").map((l) => `# ${l}`));
  rows.push("序號,時間,說話者,內容");
  opts.messages.forEach((m, i) => {
    const who = m.role === "user" ? opts.speakers.user : opts.speakers.assistant;
    rows.push([String(i + 1), formatClock(m.ts), who, csvCell(m.content)].join(","));
  });
  // UTF-8 BOM：沒有它 Excel 開中文 csv 會亂碼
  return "\uFEFF" + rows.join("\r\n") + "\r\n";
}

function triggerDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportChat(format: "txt" | "csv", opts: ExportOptions) {
  const now = new Date();
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const filename = `${opts.filePrefix}_${stamp}.${format}`;
  if (format === "txt") {
    triggerDownload(filename, buildTxt(opts, now), "text/plain;charset=utf-8");
  } else {
    triggerDownload(filename, buildCsv(opts, now), "text/csv;charset=utf-8");
  }
}
