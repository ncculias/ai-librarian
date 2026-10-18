import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// ts：訊息產生時間（下載對話的研究需求——可算回應延遲與對話時長）
// 一則回覆引用的資料來源:用了哪個工具、工具輸出裡出現的連結
export type ReplySource = { tool: string; label: string; urls: string[] };

type Message = {
  role: "user" | "assistant";
  content: string;
  ts?: number;
  sources?: ReplySource[]; // 只有 assistant 有;空陣列代表沒用外部工具
  kind?: "greeting"; // 進站問候語:只顯示,不送給 AI、不匯出、不掛來源/免責
};

// 一進網站(對話還是空的)時,AI 館員先打招呼
export const DEFAULT_GREETING =
  "您好，我是顏如玉館員，很高興為您服務，請問有什麼可以幫忙的嗎？";

// 書籍介紹頁的開場句
export const BOOK_GUIDE_GREETING =
  "您好，我是顏如玉館員，想了解哪本書？告訴我書名或主題，我幫你整理介紹。";

function greetingMessage(text: string): Message {
  return { role: "assistant", content: text, kind: "greeting", ts: Date.now() };
}

// 工具代號 → 顯示名稱(後端 /v1/tools 的 name)
const TOOL_LABELS: Record<string, string> = {
  date_time: "日期時間",
  arxiv: "arXiv 學術論文",
  duckduckgo_results_json: "DuckDuckGo 網頁搜尋",
  youtube_search: "YouTube 搜尋",
  ncl_search: "NBINet 全國圖書聯合目錄(國家圖書館)",
  wikipedia: "維基百科",
  google_search: "Google 搜尋",
  google_books: "Google 圖書",
  open_weather_map: "Open-Meteo 天氣資料",
};

// 從工具輸出撈出連結(去重、最多 5 條),給「資料來源」用
function extractUrls(text: string, max = 5): string[] {
  const found = text.match(/https?:\/\/[^\s"'<>）)\]]+/g) ?? [];
  return Array.from(new Set(found)).slice(0, max);
}

type APIMessage = { role: "system" | "user" | "assistant"; content: string };

type APIConfig = {
  sessionKey: string; // 對話紀錄分頁:聊天問答、書籍介紹各自一份
  greeting: string; // 該頁對話為空時的開場句
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  currentModel: string;
  onEmotion?: (emotion: string) => void; // 將情緒token加入型別
};

// 後端位址：部署時由 VITE_API_URL 指定（AWS 等環境），本機開發預設 localhost
export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

/* 掛站修復（2026-09-22）：
   1) thread_id 原本寫死 "thread-frontend"，部署後所有訪客共用同一條線程，
      後端記憶滾雪球直到撞 GPT 上下文上限、全站報錯。
      改為每次請求一次性隨機編號（無狀態模式：對話記憶以前端帶的歷史為準）。
   2) 送出的歷史加上限，單一使用者聊再久也不會超過模型上下文。 */
const HISTORY_LIMIT = 20;
const newThreadId = () =>
  `web-${(crypto.randomUUID?.() ?? Math.random().toString(36).slice(2))}`;

/* 對話狀態住在模組層級的 session（依 sessionKey 分頁：聊天問答、書籍介紹各一份），
   不住在 React 元件裡。串流由 session 自己跑、自己寫回，所以切到別頁（元件卸載）
   回覆照樣跑完，回來時 hook 重新訂閱就看得到完整結果。重新整理才歸零。 */
type ChatSession = {
  messages: Message[];
  followUpQuestions: string[];
  loading: boolean;
  pendingStatus: string | null; // 等待中的狀態文字（三點思考泡泡）；null = 沒有泡泡
  inFlight: boolean; // 並發鎖：回覆進行中一律不收新請求
  lastEmotion: string | null; // 最近一次情緒；回到頁面時補套到角色上
  onEmotion: ((emotion: string) => void) | null; // 目前掛載中的頁面的情緒回呼
  listeners: Set<() => void>;
};

const sessions = new Map<string, ChatSession>();

function getSession(key: string, greeting: string): ChatSession {
  let session = sessions.get(key);
  if (!session) {
    session = {
      messages: [greetingMessage(greeting)],
      followUpQuestions: [],
      loading: false,
      pendingStatus: null,
      inFlight: false,
      lastEmotion: null,
      onEmotion: null,
      listeners: new Set(),
    };
    sessions.set(key, session);
  }
  return session;
}

// 改 session 一律走這裡：換成新物件/新陣列（useSyncExternalStore 靠參照判斷變動）再通知訂閱者
function update(session: ChatSession, patch: Partial<ChatSession>) {
  Object.assign(session, patch);
  session.listeners.forEach((fn) => fn());
}

function appendToAssistant(session: ChatSession, delta: string) {
  if (!delta) return;
  const last = session.messages.length - 1;
  const lastMessage = session.messages[last];
  if (!lastMessage || lastMessage.role !== "assistant") return;
  const updated = [...session.messages];
  updated[last] = { ...lastMessage, content: lastMessage.content + delta };
  update(session, { messages: updated });
}

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

type SendConfig = {
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  currentModel: string;
};

// async/await + Promise：向後端請求延伸問題
async function requestFollowUps(session: ChatSession, answer: string, cfg: SendConfig) {
  try {
    const res = await fetch(`${API_BASE}/v2/react/run`, {
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
          model: cfg.currentModel,
          temperature: cfg.temperature,
          max_tokens: 128,
        },
        thread_id: newThreadId(),
      }),
    });

    const json = await res.json();
    const text = json?.messages?.[0]?.content ?? "";
    update(session, { followUpQuestions: parseSuggestions(text) });
  } catch (err) {
    console.error("延伸問題錯誤：", err);
  }
}

// async/await：送出訊息並接收 SSE。不綁元件生命週期：頁面切走也會跑完並寫進 session
async function sendMessage(session: ChatSession, text: string, cfg: SendConfig) {
  // 並發鎖（按鈕/Enter/建議問題/延伸問題四條路統一在這擋）
  if (session.inFlight) return;
  session.inFlight = true;

  const userMsg: Message = { role: "user", content: text, ts: Date.now() };
  // 組 API messages：只帶最近 HISTORY_LIMIT 則（問候語不算對話），夠連貫又不撞上下文上限
  const messagesForAPI: APIMessage[] = [
    { role: "system", content: cfg.systemPrompt },
    ...session.messages
      .filter((m) => m.kind !== "greeting")
      .slice(-HISTORY_LIMIT)
      .map((m) => ({ role: m.role, content: m.content } as APIMessage)),
    userMsg,
  ];

  update(session, {
    messages: [...session.messages, userMsg],
    loading: true,
    pendingStatus: "思考中",
    followUpQuestions: [],
  });

  let llmBuffer = "";
  // 這一輪問答用過的工具(含連結),回覆開始時掛到 assistant 訊息的 sources
  const pendingSources: ReplySource[] = [];

  try {
    const response = await fetch(`${API_BASE}/v2/react/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: messagesForAPI,
        llm_config: {
          model: cfg.currentModel,
          temperature: cfg.temperature,
          max_tokens: cfg.maxTokens,
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
        const eventLine = lines.find((l) => l.startsWith("event:"));
        const dataLine = lines.find((l) => l.startsWith("data:"));
        if (!eventLine || !dataLine) continue;

        const eventType = eventLine.replace("event:", "").trim().toLowerCase();
        // 壞一段跳一段：單一壞封包不炸斷整條回覆
        let data: any;
        try {
          data = JSON.parse(dataLine.replace("data:", "").trim());
        } catch {
          console.warn("略過無法解析的 SSE 區塊：", part.slice(0, 120));
          continue;
        }

        switch (eventType) {
          case "tool_chosen":
            // 不塞進對話紀錄，改顯示在等待泡泡的狀態文字
            update(session, { pendingStatus: `正在使用：${data.used_tools?.name ?? "工具"}⋯⋯` });
            break;

          case "tool_output": {
            console.log("🔧 工具輸出：", data);
            const tool = String(data.used_tools?.name ?? "");
            const output = String(data.used_tools?.output ?? "");
            if (tool && !output.startsWith("Error:")) {
              pendingSources.push({ tool, label: TOOL_LABELS[tool] ?? tool, urls: extractUrls(output) });
            }
            // 工具跑完、回到思考狀態（多工具串接時會再切到下一個工具名）
            update(session, { pendingStatus: "思考中" });
            break;
          }

          case "emotion":
            if (data.emotion) {
              session.lastEmotion = String(data.emotion);
              session.onEmotion?.(session.lastEmotion);
            }
            break;

          case "llm_start": {
            const chunk = typeof data.message_chunk === "string" ? data.message_chunk : "";
            llmBuffer = chunk;
            update(session, {
              pendingStatus: null, // 第一個字到了，收起思考泡泡
              messages: [
                ...session.messages,
                { role: "assistant", content: chunk, ts: Date.now(), sources: [...pendingSources] },
              ],
            });
            break;
          }

          case "llm_delta": {
            const chunk = typeof data.message_chunk === "string" ? data.message_chunk : "";
            llmBuffer += chunk;
            appendToAssistant(session, chunk);
            break;
          }

          case "llm_end": {
            const chunk = typeof data.message_chunk === "string" ? data.message_chunk : "";
            if (chunk) {
              llmBuffer += chunk;
              appendToAssistant(session, chunk);
            }
            // 回覆結束:把這一輪的工具來源定稿到最後一則 assistant 訊息
            const last = session.messages.length - 1;
            if (last >= 0 && session.messages[last].role === "assistant") {
              const updated = [...session.messages];
              updated[last] = { ...updated[last], sources: [...pendingSources] };
              update(session, { messages: updated, loading: false });
            } else {
              update(session, { loading: false });
            }
            void requestFollowUps(session, llmBuffer, cfg);
            break;
          }

          default:
            console.warn("未知事件：", eventType, data);
        }
      }
    }

    update(session, { loading: false, pendingStatus: null });
  } catch (err) {
    console.error("sendMessage 錯誤：", err);
    // 有中文人話（後端 detail 或上面自組的訊息）就照顯示；其他技術性錯誤給通用文案
    const raw = err instanceof Error ? err.message : "";
    const msg = /[一-鿿]/.test(raw) ? raw : "系統錯誤，請確認網路或稍後再試";
    update(session, {
      messages: [...session.messages, { role: "assistant", content: msg, ts: Date.now() }],
      loading: false,
      pendingStatus: null,
    });
  } finally {
    // 串流完整結束（或失敗）才釋放鎖
    session.inFlight = false;
  }
}

export default function useLLMStream({
  sessionKey,
  greeting,
  systemPrompt,
  temperature,
  maxTokens,
  currentModel,
  onEmotion,
}: APIConfig) {
  const session = getSession(sessionKey, greeting);
  const subscribe = useCallback(
    (fn: () => void) => {
      session.listeners.add(fn);
      return () => {
        session.listeners.delete(fn);
      };
    },
    [session],
  );
  const messages = useSyncExternalStore(subscribe, () => session.messages);
  const followUpQuestions = useSyncExternalStore(subscribe, () => session.followUpQuestions);
  const loading = useSyncExternalStore(subscribe, () => session.loading);
  const pendingStatus = useSyncExternalStore(subscribe, () => session.pendingStatus);
  const [input, setInput] = useState("");

  // 情緒回呼掛在 session 上，頁面在時才收得到；回到頁面先補套最近一次情緒（角色不會回到面無表情）
  const onEmotionRef = useRef(onEmotion);
  onEmotionRef.current = onEmotion;
  useEffect(() => {
    const relay = (emotion: string) => onEmotionRef.current?.(emotion);
    session.onEmotion = relay;
    if (session.lastEmotion) relay(session.lastEmotion);
    return () => {
      if (session.onEmotion === relay) session.onEmotion = null;
    };
  }, [session]);

  // 送出用的設定取呼叫當下的值（設定視窗改完立即生效）
  const handleSend = async (customInput?: string) => {
    const text = customInput ?? input;
    if (!text.trim()) return;
    if (session.inFlight) return;
    setInput("");
    await sendMessage(session, text, { systemPrompt, temperature, maxTokens, currentModel });
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
