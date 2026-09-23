import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowDown, MessageCircleQuestionMark } from "lucide-react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

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
};

const orderedListPattern = /^\d+\.\s+/;
const unorderedListPattern = /^[-*]\s+/;
const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const bareUrlPattern = /(https?:\/\/[^\s<]+)/g;
const inlineCodePattern = /`([^`]+)`/g;
const boldPattern = /\*\*([^*]+)\*\*/g;

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = new RegExp(
    `${markdownLinkPattern.source}|${inlineCodePattern.source}|${boldPattern.source}|${bareUrlPattern.source}`,
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
    } else if (match[5]) {
      nodes.push(
        <a
          key={`${match.index}-${match[5]}`}
          href={match[5]}
          target="_blank"
          rel="noreferrer"
          className="message-link"
        >
          {match[5]}
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
  const blocks = content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map((block, blockIndex) => {
    const lines = block.split("\n").filter(Boolean);
    const isOrderedList =
      lines.length > 1 && lines.every((line) => orderedListPattern.test(line));
    const isUnorderedList =
      lines.length > 1 && lines.every((line) => unorderedListPattern.test(line));

    if (isOrderedList) {
      return (
        <ol
          key={`ordered-${blockIndex}`}
          className="message-list list-decimal space-y-1 pl-5"
        >
          {lines.map((line, itemIndex) => (
            <li key={`ordered-${blockIndex}-${itemIndex}`}>
              {renderInlineMarkdown(line.replace(orderedListPattern, ""))}
            </li>
          ))}
        </ol>
      );
    }

    if (isUnorderedList) {
      return (
        <ul
          key={`unordered-${blockIndex}`}
          className="message-list list-disc space-y-1 pl-5"
        >
          {lines.map((line, itemIndex) => (
            <li key={`unordered-${blockIndex}-${itemIndex}`}>
              {renderInlineMarkdown(line.replace(unorderedListPattern, ""))}
            </li>
          ))}
        </ul>
      );
    }

    return renderParagraph(block, `paragraph-${blockIndex}`);
  });
}

export default function MessageList({
  messages,
  followUpQuestions,
  onFollowUpClick,
  assistantActions,
  pendingStatus,
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
              <div className="message-markdown space-y-3">
                {renderMarkdownContent(m.content)}
              </div>
            ) : (
              m.content
            )}
          </div>
        );

        if (
          m.role === "assistant" &&
          assistantActions?.messageIndex === i
        ) {
          return (
            <div key={i} className="flex items-start gap-2">
              {bubble}
              {assistantActions.controls}
            </div>
          );
        }

        return <div key={i}>{bubble}</div>;
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
