// 對話氣泡用的簡化 Markdown 區塊解析（純函式，不碰 React）。
// 模型回覆常見的格式只有：標題、條列、段落；標題與條列行可以直接接在文字後面，
// 不像標準 Markdown 一定要空一行——這是回覆裡最常見的寫法，也是之前「### 露出來」的原因。
// 行內格式（粗體、連結、程式碼）由 MessageList 的 renderInlineMarkdown 處理。

export type MarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "list"; ordered: boolean; items: string[] };

const headingPattern = /^(#{1,6})\s+(.*\S)\s*$/;
const orderedItemPattern = /^\s*\d+[.)]\s+(.*)$/;
const unorderedItemPattern = /^\s*[-*•]\s+(.*)$/;

export function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", lines: paragraph });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ type: "list", ...list });
    list = null;
  };

  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = headingPattern.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      blocks.push({ type: "heading", level, text: heading[2] });
      continue;
    }

    const ordered = orderedItemPattern.exec(line);
    const unordered = ordered ? null : unorderedItemPattern.exec(line);
    if (ordered || unordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      if (list && list.ordered !== isOrdered) flushList();
      if (!list) list = { ordered: isOrdered, items: [] };
      list.items.push((ordered ?? unordered)![1].trim());
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}
