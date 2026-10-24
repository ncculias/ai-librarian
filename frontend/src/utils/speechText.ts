// 朗讀前的文字處理（純函式）：
// 1) 把 Markdown 符號拿掉，只留要念的字（念出「星號星號」很怪，網址也沒人想聽）
// 2) 依段落與句子切成小段，讓 Gemini TTS 一段一段合成、邊到邊播，不用等整篇念完才出聲

export const SPEECH_CHUNK_MAX = 150;

export function stripMarkdownForSpeech(text: string): string {
  return (
    text
      // [文字](網址) → 文字；<網址> / 裸網址 → 刪除
      .replace(/\[([^\]]+)\]\((?:https?:\/\/)[^\s)]+\)/g, "$1")
      .replace(/<https?:\/\/[^\s>]+>/g, "")
      .replace(/https?:\/\/[^\s"'<>）)\]]+/g, "")
      // 行首的標題井字、條列符號、編號
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/^\s*[-*•]\s+/gm, "")
      .replace(/^\s*\d+[.)]\s+/gm, "")
      // 粗體、斜體、行內程式碼的標記
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      // 多餘空白（含每行行尾）
      .replace(/[ \t]+/g, " ")
      .replace(/ ?\n ?/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

// 切段：先依段落（換行），段落內再依句末標點切句，貪婪地把句子塞進不超過 maxLen 的段；
// 單句超過 maxLen 就再依逗頓號切。回傳的每段都非空白。
export function splitForSpeech(text: string, maxLen = SPEECH_CHUNK_MAX): string[] {
  const chunks: string[] = [];
  let current = "";
  const push = () => {
    const t = current.trim();
    if (t) chunks.push(t);
    current = "";
  };
  const add = (piece: string) => {
    const p = piece.trim();
    if (!p) return;
    if (current && current.length + p.length > maxLen) push();
    current += p;
  };

  for (const paragraph of text.split(/\n+/)) {
    const sentences = paragraph.match(/[^。！？!?；;]+[。！？!?；;]*/g) ?? [];
    for (const sentence of sentences) {
      if (sentence.trim().length <= maxLen) {
        add(sentence);
        continue;
      }
      // 超長句：依逗號、頓號再切
      for (const clause of sentence.match(/[^，、,]+[，、,]*/g) ?? [sentence]) add(clause);
    }
    push(); // 段落結束一定斷段，念起來才有停頓
  }
  push();
  return chunks;
}
