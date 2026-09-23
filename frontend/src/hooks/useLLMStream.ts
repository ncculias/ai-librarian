import { useState, useRef } from "react";

type Message = { role: "user" | "assistant"; content: string };

type APIMessage = { role: "system" | "user" | "assistant"; content: string };

type APIConfig = {
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  currentModel: string;
  onEmotion?: (emotion: string) => void; // 將情緒token加入型別
};

export default function useLLMStream({
  systemPrompt,
  temperature,
  maxTokens,
  currentModel,
  onEmotion,
}: APIConfig) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([]);
  // 等待中的狀態文字（顯示在「三點思考泡泡」裡）；null = 沒有等待泡泡
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

  /* 掛站修復（2026-09-22）：
     1) thread_id 原本寫死 "thread-frontend"，部署後所有訪客共用同一條線程，
        後端記憶滾雪球直到撞 GPT 上下文上限、全站報錯。
        改為每次請求一次性隨機編號（無狀態模式：對話記憶以前端帶的歷史為準）。
     2) 送出的歷史加上限，單一使用者聊再久也不會超過模型上下文。 */
  const HISTORY_LIMIT = 20;
  const newThreadId = () =>
    `web-${(crypto.randomUUID?.() ?? Math.random().toString(36).slice(2))}`;

  const llmBufferRef = useRef<string>("");
  // 並發鎖用 ref 而不是 state：state 要等重繪才更新，連點的空窗會穿透；ref 當下就生效
  const inFlightRef = useRef(false);

  const appendToAssistantMessage = (delta: string) => {
    if (!delta) return;
    setMessages((prev) => {
      if (prev.length === 0) return prev;

      const updated = [...prev];
      const lastIndex = updated.length - 1;
      const lastMessage = updated[lastIndex];
      if (!lastMessage || lastMessage.role !== "assistant") return prev;

      updated[lastIndex] = {
        ...lastMessage,
        content: lastMessage.content + delta,
      };
      return updated;
    });
  };

  // async/await + Promise：向後端請求延伸問題
  const requestFollowUps = async (answer: string) => {
    try {

      const res = await fetch("http://localhost:8000/v2/react/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: "你是一個助手。只允許輸出 JSON 陣列，不要其他文字。",
            },
            {
              role: "user",
              content:
                '請根據以下回答生成三個延伸追問問題，輸出格式必須是 JSON 陣列。例如:["問題1","問題2","問題3"]。\n\n回答內容: ' +
                answer,
            },
          ],
          llm_config: {
            model: currentModel,
            temperature,
            max_tokens: 128,
          },
          thread_id: newThreadId(),
        }),
      });

      const json = await res.json();
      const text = json?.messages?.[0]?.content ?? "";
      setFollowUpQuestions(parseSuggestions(text));
    } catch (err) {
      console.error("延伸問題錯誤：", err);
    }
  };

  // function 宣告：解析延伸問題
  function parseSuggestions(text: string): string[] {
    try {
      const arr = JSON.parse(text);
      if (Array.isArray(arr)) return arr;
    } catch (_) {}

    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const arr = JSON.parse(match[0]);
        if (Array.isArray(arr)) return arr;
      } catch (_) {}
    }

    // split + map + filter：寬鬆解析（map/filter 語法）
    return text
      .split(/\n|,|。/g)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);
  }

  // async/await：送出訊息並接收 SSE
  const handleSend = async (customInput?: string) => {
    // 並發鎖：回覆進行中一律不收新請求（按鈕/Enter/建議問題/延伸問題四條路統一在這擋）
    if (inFlightRef.current) return;
    const text = customInput ?? input;
    if (!text.trim()) return;
    inFlightRef.current = true;

    // 先插入使用者訊息
    const userMsg: Message = { role: "user", content: text };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setPendingStatus("思考中");
    setFollowUpQuestions([]);

    // 組 API messages
    const messagesForAPI: APIMessage[] = [
      { role: "system", content: systemPrompt },
      // 只帶最近 HISTORY_LIMIT 則：夠維持對話連貫，又不會撞模型上下文上限
      ...messages
        .slice(-HISTORY_LIMIT)
        .map((m) => ({ role: m.role, content: m.content } as APIMessage)),
      userMsg,
    ];

    try {
      llmBufferRef.current = "";

      // 開 SSE 請求

      const response = await fetch("http://localhost:8000/v2/react/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messagesForAPI,
          llm_config: {
            model: currentModel,
            temperature,
            max_tokens: maxTokens,
          },
          thread_id: newThreadId(),
        }),
      });

      // 先確認不是錯誤回應，再開始解串流（錯誤回應也有 body，硬解會默默失敗）
      if (!response.ok) {
        const detail = await response
          .json()
          .then((j) => j?.detail)
          .catch(() => null);
        throw new Error(
          typeof detail === "string" && detail
            ? detail
            : `伺服器回應異常（${response.status}），請稍後再試`
        );
      }
      if (!response.body) throw new Error("後端沒有 body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        // for...of：逐段解析 SSE 區塊
        for (const part of parts) {
          if (!part.trim()) continue;

          const lines = part.split("\n");
          // find（callback 為箭頭函式）
          const eventLine = lines.find((l) => l.startsWith("event:"));
          const dataLine = lines.find((l) => l.startsWith("data:"));
          if (!eventLine || !dataLine) continue;

          const eventType = eventLine
            .replace("event:", "")
            .trim()
            .toLowerCase();
          // 壞一段跳一段：單一壞封包不炸斷整條回覆
          let data: any;
          try {
            data = JSON.parse(dataLine.replace("data:", "").trim());
          } catch {
            console.warn("略過無法解析的 SSE 區塊：", part.slice(0, 120));
            continue;
          }

          // 處理不同事件
          switch (eventType) {
            case "tool_chosen":
              // 不再塞進對話紀錄，改顯示在等待泡泡的狀態文字
              setPendingStatus(`正在使用：${data.used_tools?.name ?? "工具"}⋯⋯`);
              break;

            case "tool_output":
              console.log("🔧 工具輸出：", data);
              // 工具跑完、回到思考狀態（多工具串接時會再切到下一個工具名）
              setPendingStatus("思考中");
              break;

            case "emotion":

              if (onEmotion && data.emotion) {
                onEmotion(data.emotion);
              }
              break;

            case "llm_start":
              {

                const chunk =
                  typeof data.message_chunk === "string"
                    ? data.message_chunk
                    : "";
                llmBufferRef.current = chunk;
                setPendingStatus(null); // 第一個字到了，收起思考泡泡

                setMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: chunk },
                ]);
              }
              break;

            case "llm_delta":
              {

                const chunk =
                  typeof data.message_chunk === "string"
                    ? data.message_chunk
                    : "";
                llmBufferRef.current += chunk;
                appendToAssistantMessage(chunk);
              }
              break;

            case "llm_end":
              {

                const chunk =
                  typeof data.message_chunk === "string"
                    ? data.message_chunk
                    : "";
                if (chunk) {
                  llmBufferRef.current += chunk;
                  appendToAssistantMessage(chunk);
                }

                requestFollowUps(llmBufferRef.current);
                setLoading(false);
              }
              break;

            default:
              console.warn("未知事件：", eventType, data);
          }
        }
      }

      setLoading(false);
      setPendingStatus(null);
    } catch (err) {
      console.error("handleSend 錯誤：", err);
      // 有中文人話（後端 detail 或上面自組的訊息）就照顯示；
      // 其他技術性錯誤（如 Failed to fetch）給通用文案
      const raw = err instanceof Error ? err.message : "";
      const msg = /[一-鿿]/.test(raw)
        ? raw
        : "系統錯誤，請確認網路或稍後再試";
      setMessages((prev) => [...prev, { role: "assistant", content: msg }]);
      setLoading(false);
      setPendingStatus(null);
    } finally {
      // 串流完整結束（或失敗）才釋放鎖
      inFlightRef.current = false;
    }
  };

  return {
    messages,
    followUpQuestions,
    input,
    setInput,
    loading,
    pendingStatus,
    handleSend,
  };
}
