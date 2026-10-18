import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDown,
  Check,
  Copy,
  MessageCircleQuestionMark,
  Square,
  Volume2,
} from "lucide-react";
import { parseMarkdownBlocks } from "./markdownBlocks";

type ReplySource = { tool: string; label: string; urls: string[] };

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: ReplySource[]; // assistant 回覆用過的工具與連結(空 = 沒用外部工具)
  kind?: "greeting"; // 進站問候語:不顯示來源/免責
};

// 同一個工具在一輪裡可能被叫多次(例如重試),顯示時合併並去重連結
function mergeSources(sources: ReplySource[]): ReplySource[] {
  const byTool = new Map<string, ReplySource>();
  for (const s of sources) {
    const cur = byTool.get(s.tool);
    if (!cur) byTool.set(s.tool, { ...s, urls: [...s.urls] });
    else cur.urls = Array.from(new Set([...cur.urls, ...s.urls]));
  }
  return Array.from(byTool.values());
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// 每則 AI 回覆下方的「資料來源 + 免責提醒」
function ReplyFooter({ sources }: { sources?: ReplySource[] }) {
  const merged = mergeSources(sources ?? []);
  return (
    <div
      className="msg-text-xs mt-3 border-t pt-2"
      style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
    >
      <div>
        <span className="font-semibold">資料來源：</span>
        {merged.length === 0 ? (
          <span>未使用外部查詢工具，依 AI 既有知識回答。</span>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {merged.map((s) => (
              <li key={s.tool}>
                {s.label}
                {s.urls.map((u, j) => (
                  <span key={u}>
                    {j === 0 ? "：" : "、"}
                    <a
                      href={u}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all underline"
                      title={u}
                    >
                      {hostOf(u)}
                      {s.urls.length > 1 ? ` (${j + 1})` : ""}
                    </a>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-1">⚠ AI 生成的內容可能有誤，重要資訊請自行查證。</div>
    </div>
  );
}

type Props = {
  messages: Message[];
  followUpQuestions: string[];
  onFollowUpClick: (q: string) => void;
  assistantActions?: {
    messageIndex: number;
    controls: ReactNode;
  };
  /** 等待中的狀態文字（例如「思考中」「正在使用：google書籍⋯⋯」）；有值就顯示三點思考泡泡 */
  pendingStatus?: string | null;
  /** 每則 AI 回覆下方的動作列:複製、朗讀/停止(index 為訊息在 messages 的索引) */
  onCopy?: (index: number) => boolean | void | Promise<boolean | void>;
  onSpeak?: (index: number) => void;
  onStopSpeak?: () => void;
  speakingIndex?: number | null;
  /** 正在向後端取語音(Gemini TTS 合成中),按鈕顯示「準備中」 */
  speakLoading?: boolean;
};

// 每則 AI 回覆下方的動作列(仿 ChatGPT):複製、朗讀
function ReplyActions({
  index,
  speaking,
  loading,
  showSpeak,
  onCopy,
  onSpeak,
  onStopSpeak,
}: {
  index: number;
  speaking: boolean;
  loading: boolean;
  showSpeak: boolean;
  onCopy?: (index: number) => boolean | void | Promise<boolean | void>;
  onSpeak?: (index: number) => void;
  onStopSpeak?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  if (!onCopy && !onSpeak) return null;
  return (
    <div className="mt-1 flex items-center gap-1">
      {onCopy && (
        <button
          type="button"
          onClick={async () => {
            // 只有真的複製成功才顯示「已複製」;失敗由父層用提示告知
            const ok = await onCopy(index);
            if (ok === false) return;
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
          className="theme-icon-button inline-flex items-center gap-1 rounded-md px-2 py-1 msg-text-sm"
          aria-label="複製這則回覆"
          title="複製"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          <span>{copied ? "已複製" : "複製"}</span>
        </button>
      )}
      {showSpeak && onSpeak && (
        <button
          type="button"
          onClick={() => (speaking ? onStopSpeak?.() : onSpeak(index))}
          className="theme-icon-button inline-flex items-center gap-1 rounded-md px-2 py-1 msg-text-sm"
          aria-label={speaking ? "停止朗讀" : "朗讀這則回覆"}
          title={speaking ? "停止" : "朗讀"}
        >
          {speaking ? <Square className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          <span>{speaking ? (loading ? "準備中…" : "停止") : "朗讀"}</span>
        </button>
      )}
    </div>
  );
}

const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
// Markdown 自動連結 <https://...>：顯示時去掉尖括號
const autolinkPattern = /<(https?:\/\/[^\s>]+)>/g;
// 裸網址：排除 < >，否則 <url> 的結尾 > 會被吞進網址、連結壞掉
const bareUrlPattern = /(https?:\/\/[^\s<>]+)/g;
const inlineCodePattern = /`([^`]+)`/g;
const boldPattern = /\*\*([^*]+)\*\*/g;

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = new RegExp(
    `${markdownLinkPattern.source}|${inlineCodePattern.source}|${boldPattern.source}|${autolinkPattern.source}|${bareUrlPattern.source}`,
    "g"
  );

  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1] && match[2]) {
      nodes.push(
        <a
          key={`${match.index}-${match[2]}`}
          href={match[2]}
          target="_blank"
          rel="noreferrer"
          className="message-link"
        >
          {match[1]}
        </a>
      );
    } else if (match[3]) {
      nodes.push(
        <code key={`${match.index}-${match[3]}`} className="message-inline-code">
          {match[3]}
        </code>
      );
    } else if (match[4]) {
      nodes.push(
        <strong key={`${match.index}-${match[4]}`} className="font-semibold">
          {match[4]}
        </strong>
      );
    } else if (match[5] || match[6]) {
      // match[5]＝<url> 自動連結（尖括號不顯示）；match[6]＝裸網址
      const url = match[5] ?? match[6];
      nodes.push(
        <a
          key={`${match.index}-${url}`}
          href={url}
          target="_blank"
          rel="noreferrer"
          className="message-link"
        >
          {url}
        </a>
      );
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderParagraph(text: string, key: string) {
  const lines = text.split("\n");

  return (
    <p key={key} className="leading-6">
      {lines.map((line, index) => (
        <span key={`${key}-line-${index}`}>
          {index > 0 ? <br /> : null}
          {renderInlineMarkdown(line)}
        </span>
      ))}
    </p>
  );
}

function renderMarkdownContent(content: string) {
  return parseMarkdownBlocks(content).map((block, blockIndex) => {
    if (block.type === "heading") {
      const Tag = `h${block.level + 2}` as "h3" | "h4" | "h5";
      return (
        <Tag key={`heading-${blockIndex}`} className={`message-heading message-heading-${block.level}`}>
          {renderInlineMarkdown(block.text)}
        </Tag>
      );
    }

    if (block.type === "list") {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag
          key={`list-${blockIndex}`}
          start={block.ordered ? block.start : undefined}
          className={`message-list ${block.ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5`}
        >
          {block.items.map((item, itemIndex) => (
            <li key={`list-${blockIndex}-${itemIndex}`}>
              {item.split("\n").map((line, lineIndex) => (
                <span key={`list-${blockIndex}-${itemIndex}-${lineIndex}`}>
                  {lineIndex > 0 ? <br /> : null}
                  {renderInlineMarkdown(line)}
                </span>
              ))}
            </li>
          ))}
        </ListTag>
      );
    }

    return renderParagraph(block.lines.join("\n"), `paragraph-${blockIndex}`);
  });
}

export default function MessageList({
  messages,
  followUpQuestions,
  onFollowUpClick,
  assistantActions,
  pendingStatus,
  onCopy,
  onSpeak,
  onStopSpeak,
  speakingIndex = null,
  speakLoading = false,
}: Props) {
  // 自動捲到最新：使用者在底部附近才跟著捲；往上讀舊訊息時不打擾。
  // 自己送出的訊息（最後一則是 user）則一律捲到底。
  const listRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);
  const prevLenRef = useRef(0);
  // 使用者捲到上面時，顯示「回到最新」浮動鈕（長輩不一定知道捲軸怎麼用）
  const [showJump, setShowJump] = useState(false);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    nearBottomRef.current = near;
    setShowJump(!near && el.scrollHeight > el.clientHeight + 160);
  };

  const jumpToLatest = () => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    // 不依賴捲動事件（程式設定 scrollTop 時瀏覽器不一定發事件），直接收狀態
    nearBottomRef.current = true;
    setShowJump(false);
  };

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const isNewMsg = messages.length !== prevLenRef.current;
    prevLenRef.current = messages.length;
    const lastIsUser = messages[messages.length - 1]?.role === "user";
    if ((isNewMsg && lastIsUser) || nearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    // 依賴含 followUpQuestions：延伸問題按鈕出現時也要跟著捲，不然會被埋在底下
  }, [messages, pendingStatus, followUpQuestions]);

  return (
    <>
    <div
      ref={listRef}
      onScroll={onScroll}
      className="theme-panel flex-1 space-y-3 overflow-y-auto rounded-xl p-4"
    >
      {messages.map((m, i) => {
        const bubble = (
          <div
            className={`msg-text max-w-[70%] whitespace-pre-wrap break-words rounded-lg p-3 ${
              m.role === "user"
                ? "message-bubble-user ml-auto"
                : "message-bubble-assistant mr-auto"
            }`}
          >
            {m.role === "assistant" ? (
              <>
                <div className="message-markdown space-y-3">
                  {renderMarkdownContent(m.content)}
                </div>
                {m.kind !== "greeting" && <ReplyFooter sources={m.sources} />}
              </>
            ) : (
              m.content
            )}
          </div>
        );

        // 說故事模式已有自己的播放/停止鈕時,動作列就不重複放朗讀鈕
        const actions =
          m.role === "assistant" ? (
            <ReplyActions
              index={i}
              speaking={speakingIndex === i}
              loading={speakingIndex === i && speakLoading}
              showSpeak={assistantActions?.messageIndex !== i}
              onCopy={onCopy}
              onSpeak={onSpeak}
              onStopSpeak={onStopSpeak}
            />
          ) : null;

        if (
          m.role === "assistant" &&
          assistantActions?.messageIndex === i
        ) {
          return (
            <div key={i}>
              <div className="flex items-start gap-2">
                {bubble}
                {assistantActions.controls}
              </div>
              {actions}
            </div>
          );
        }

        return (
          <div key={i}>
            {bubble}
            {actions}
          </div>
        );
      })}

      {/* 思考泡泡：等待回覆時顯示三點動畫＋目前階段（第一個字到就消失） */}
      {pendingStatus && (
        <div
          className="msg-text message-bubble-assistant mr-auto flex max-w-[70%] items-center gap-2 rounded-lg p-3"
          role="status"
          aria-live="polite"
        >
          <span className="typing-dots" aria-hidden="true">
            <i /><i /><i />
          </span>
          <span className="text-[var(--color-text-secondary)]">{pendingStatus}</span>
        </div>
      )}

      {followUpQuestions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {followUpQuestions.map((q, i) => (
            <button
              key={i}
              onClick={() => onFollowUpClick(q)}
              className="msg-text theme-button-accent inline-flex items-center gap-1.5 rounded-lg px-3 py-1"
            >
              {/* 圖示用 1em 尺寸：跟著 A+/A- 的字級一起縮放 */}
              <MessageCircleQuestionMark className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />
              {q}
            </button>
          ))}
        </div>
      )}
      </div>

      {/* 回到最新：獨立橫幅、在訊息區「外面」，永遠不會壓到正在讀的字 */}
      {showJump && (
        <div className="mt-2 flex justify-center">
          <button
            onClick={jumpToLatest}
            className="theme-button-accent flex items-center gap-2 rounded-full px-6 py-2.5 text-base font-semibold shadow-md"
          >
            <ArrowDown className="h-5 w-5" /> 回到最新訊息
          </button>
        </div>
      )}
    </>
  );
}
