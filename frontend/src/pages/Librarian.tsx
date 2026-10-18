import type { ElementType } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { mcpTools, type Tool } from "../data/mcpTools";
import { exportChat } from "../utils/exportChat";
import {
  Clock,
  FlaskConical,
  Search,
  SquarePlay,
  BookOpen,
  Globe,
  Bookmark,
  CloudSun,
  Settings,
  Maximize2,
  Minimize2,
  Download,
  Play,
  Square,
  SlidersHorizontal,
  MessageCircleQuestionMark,
  ChevronUp,
} from "lucide-react";

import Live2DArea from "../components/Live2DArea";
import ToolsSection from "../components/ToolsSection";
import MessageList from "../components/MessageList";
import ChatInput from "../components/ChatInput";
import ChatModeMenu from "../components/ChatModeMenu";
import ConfigModal, { type ConfigDraft } from "../components/ConfigModal";
import { YANRUYU_MOTION_SPEED, isYanruyuUrl } from "../components/live2d/yanruyu";
import type { MouthSource } from "../components/live2d/lipsync";
import {
  createFakeMouthSource,
  getAnalyserMouthSource,
  warmUpAudioContext,
} from "../components/live2d/lipsyncSources";
import {
  DEFAULT_CHARACTER_VIEW,
  DEFAULT_LAYOUT_MODE,
  parseCharacterView,
  parseLayoutMode,
  type CharacterView,
  type LayoutMode,
} from "../components/live2d/display";
import { API_BASE } from "../hooks/useLLMStream";
import Popover from "../components/Popover";
import Toast from "../components/Toast";

// LLM streaming hook（負責聊天／工具呼叫／情緒回傳）
import useLLMStream, { DEFAULT_GREETING } from "../hooks/useLLMStream";
import { availableModels, defaultModel } from "../data/models";
import {
  BOOK_GUIDE_INSTRUCTION,
  DEFAULT_SYSTEM_PROMPT,
  assemblePersona,
  defaultPersonaModules,
  normalizePrompt,
  type PersonaModuleSet,
} from "../data/personaModules";

const toolIconMap: Record<string, ElementType> = {
  date_time: Clock,
  arxiv: FlaskConical,
  duckduckgo_results_json: Search,
  youtube_search: SquarePlay,
  ncl_search: BookOpen,
  wikipedia: Globe,
  google_search: Search,
  google_books: Bookmark,
  open_weather_map: CloudSun,
};

const chatModes = [
  {
    id: "general",
    label: "一般問答",
    description: "一般問題、搜尋與推薦。",
  },
  {
    id: "book-guide",
    label: "書籍介紹",
    description: "以書籍資料整理重點與閱讀方向。",
  },
] as const;

// 模式列收合狀態的 localStorage key
const MODE_BAR_KEY = "chatModeBarCollapsed";

const bookOutputModes = [
  {
    id: "text",
    label: "文字介紹",
  },
  {
    id: "story",
    label: "語音說故事",
  },
] as const;

const generalPrompts = [
  "請幫我查詢今天台北的天氣及日期",
  "我今天心情不好可以給我幾首舒壓音樂嗎？",
];

const storySettings = {
  tone: ["溫柔", "穩重", "活潑"],
  pace: ["慢", "中", "快"],
};

/* 人設語氣取自《人工智慧代理圖書館員_Prompt_v1》Role Module A/B（F1–F7），
   已剝除實驗流程限制；模板內容以「五模組」結構存於 data/personaModules.ts（spec v2）。 */
const personaOptions = [
  { id: "none", label: "一般", description: "不套用人設，維持原本的回答方式" },
  { id: "professional", label: "專業能力型", description: "精準、條列、重視來源與判斷依據" },
  { id: "warm", label: "溫暖陪伴型", description: "口語、陪伴感、低壓力" },
] as const;

type PersonaId = (typeof personaOptions)[number]["id"];

const storyPaceRate: Record<string, number> = {
  慢: 0.82,
  中: 1,
  快: 1.18,
};

const storyTonePitch: Record<string, number> = {
  溫柔: 0.92,
  穩重: 0.86,
  活潑: 1.12,
};

export default function Librarian() {
  const [modelUrl, setModelUrl] = useState<string>("");
  const [emotionToken, setEmotionToken] = useState<string | null>(null);

  const [selected, setSelected] = useState<Tool | null>(null);

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [toast, setToast] = useState<{
    text: string;
    variant?: "success" | "error";
  } | null>(null);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  // 書籍介紹模式指令：出廠值在 data/personaModules.ts，使用者修改存於 aiConfig
  const [bookGuidePrompt, setBookGuidePrompt] = useState(BOOK_GUIDE_INSTRUCTION);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [motionSpeed, setMotionSpeed] = useState(YANRUYU_MOTION_SPEED);
  // 人物顯示 / 版面:首次渲染前就從本機設定讀入,避免先閃一幀預設版面
  const [characterView, setCharacterView] = useState<CharacterView>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("aiConfig") ?? "null");
      return parseCharacterView(saved?.characterView);
    } catch {
      return DEFAULT_CHARACTER_VIEW;
    }
  });
  const [layout, setLayout] = useState<LayoutMode>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("aiConfig") ?? "null");
      return parseLayoutMode(saved?.layout);
    } catch {
      return DEFAULT_LAYOUT_MODE;
    }
  });
  const [currentModel, setCurrentModel] = useState(defaultModel);
  const [chatMode, setChatMode] =
    useState<(typeof chatModes)[number]["id"]>("general");
  // 模式列收合狀態：存 localStorage（"1" = 收合；其他/缺值/例外 = 展開）。
  // 用惰性初始化，重新整理後直接落在存檔狀態，不會閃一下。
  const [isModeBarCollapsed, setIsModeBarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(MODE_BAR_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(MODE_BAR_KEY, isModeBarCollapsed ? "1" : "0");
    } catch {
      // localStorage 不可用時忽略，僅本次有效
    }
  }, [isModeBarCollapsed]);
  // 展開模式列後,把焦點交給「收合」鈕(原本的「展開」選單已卸載);只在 true→false 的實際轉換時處理,掛載(含 StrictMode 重複執行)不搶焦點
  const collapseBtnRef = useRef<HTMLButtonElement>(null);
  const prevCollapsedRef = useRef(isModeBarCollapsed);
  // 使用者在本次造訪中按過「收合」才把焦點交給標題列圖示;從 localStorage 載入的收合狀態不搶焦點
  const modeBarUserCollapsedRef = useRef(false);
  useEffect(() => {
    if (prevCollapsedRef.current && !isModeBarCollapsed) {
      collapseBtnRef.current?.focus({ preventScroll: true });
    }
    prevCollapsedRef.current = isModeBarCollapsed;
  }, [isModeBarCollapsed]);
  const [bookOutputMode, setBookOutputMode] =
    useState<(typeof bookOutputModes)[number]["id"]>("text");
  const [storyTone, setStoryTone] = useState(storySettings.tone[0]);
  const [storyPace, setStoryPace] = useState(storySettings.pace[1]);
  const [persona, setPersona] = useState<PersonaId>("none");
  // 模組化人設內容（spec v2）：出廠值在 data/personaModules.ts，使用者修改存本機
  const [personaModules, setPersonaModules] = useState<PersonaModuleSet>(() => {
    try {
      const raw = localStorage.getItem("personaModules_v2");
      if (!raw) return defaultPersonaModules();
      const saved = JSON.parse(raw);
      const d = defaultPersonaModules();
      // 逐欄驗證：缺的欄位落回出廠值，避免舊格式或壞資料弄掛畫面
      for (const pid of ["professional", "warm"] as const) {
        const sp = saved?.[pid];
        if (!sp) continue;
        for (const k of ["opening", "answer", "closing", "error"] as const) {
          if (typeof sp[k] === "string") d[pid][k] = sp[k];
        }
        if (Array.isArray(sp.custom)) {
          d[pid].custom = sp.custom.filter(
            (c: unknown): c is { name: string; content: string } =>
              !!c && typeof (c as any).name === "string" && typeof (c as any).content === "string"
          );
        }
      }
      return d;
    } catch {
      return defaultPersonaModules();
    }
  });
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const [isVoiceSettingsOpen, setIsVoiceSettingsOpen] = useState(false);
  const [voiceStatus, setVoiceStatus] =
    useState<"idle" | "playing">("idle");

  // 設定視窗按「儲存並套用」：一次接收整份草稿寫回（打字過程不再重繪整頁）
  const applySettings = (draft: ConfigDraft) => {
    const t = Math.min(1, Math.max(0, Number(draft.temperature) || 0));
    const m = Math.max(1, Math.floor(Number(draft.maxTokens) || 1));
    const s = Math.min(2.5, Math.max(0.5, Number(draft.motionSpeed) || 1));

    setSystemPrompt(draft.systemPrompt);
    setTemperature(t);
    setMaxTokens(m);
    setMotionSpeed(s);
    // 以 parse 正規化,避免不合法值寫入 state 與 localStorage
    const cv = parseCharacterView(draft.characterView);
    const lm = parseLayoutMode(draft.layout);
    setCharacterView(cv);
    setLayout(lm);
    setPersona(draft.persona as PersonaId);
    setPersonaModules(draft.personaModules);
    // 空白或非字串一律落回出廠值,state 與 localStorage 同步存正規化後的值
    const bg = normalizePrompt(draft.bookGuidePrompt, BOOK_GUIDE_INSTRUCTION);
    setBookGuidePrompt(bg);

    localStorage.setItem(
      "aiConfig",
      JSON.stringify({
        systemPrompt: draft.systemPrompt,
        temperature: t,
        maxTokens: m,
        motionSpeed: s,
        characterView: cv,
        layout: lm,
        model: currentModel,
        persona: draft.persona,
        bookGuidePrompt: bg,
      }),
    );
    localStorage.setItem("personaModules_v2", JSON.stringify(draft.personaModules));

    setToast({ text: "設定已保存並套用" });
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem("aiConfig");
      if (!raw) return;
      const saved = JSON.parse(raw);

      if (typeof saved.systemPrompt === "string" && saved.systemPrompt.trim())
        setSystemPrompt(saved.systemPrompt);
      if (typeof saved.temperature === "number")
        setTemperature(saved.temperature);
      if (typeof saved.maxTokens === "number") setMaxTokens(saved.maxTokens);
      if (typeof saved.motionSpeed === "number")
        setMotionSpeed(Math.min(2.5, Math.max(0.5, saved.motionSpeed)));
      // 舊版清單存下來的型號（如 gpt-4o）若已不在現役清單，落回新預設
      if (
        typeof saved.model === "string" &&
        (availableModels as readonly string[]).includes(saved.model)
      )
        setCurrentModel(saved.model);
      if (
        typeof saved.persona === "string" &&
        personaOptions.some((p) => p.id === saved.persona)
      )
        setPersona(saved.persona as PersonaId);
      // 缺值或空白由 normalize 落回出廠值
      setBookGuidePrompt(normalizePrompt(saved.bookGuidePrompt, BOOK_GUIDE_INSTRUCTION));
    } catch (_) {
      // 忽略錯誤，不讓 UI 中斷
    }
  }, []);

  // 三層組裝：自訂提示詞 → 人設模組 → 模式指令（順序依 Prompt v1 第九章「工程端建議」）
  const personaLabel =
    personaOptions.find((p) => p.id === persona)?.label ?? "";
  const personaPrompt =
    persona === "none"
      ? ""
      : assemblePersona(personaLabel, personaModules[persona]);
  const modeSystemPrompt = [
    systemPrompt,
    personaPrompt,
    chatMode === "book-guide" ? bookGuidePrompt : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const {
    messages,
    followUpQuestions,
    input,
    setInput,
    loading,
    pendingStatus,
    handleSend,
  } = useLLMStream({
      sessionKey: "general",
      greeting: DEFAULT_GREETING,
      systemPrompt: modeSystemPrompt,
      temperature,
      maxTokens,
      currentModel,

      onEmotion: (emo) => setEmotionToken(emo), // Model 回傳角色情緒
    });

  const suggestedQuestions = chatMode === "general" ? generalPrompts : [];
  const inputPlaceholder =
    chatMode === "book-guide" && bookOutputMode === "story"
      ? "輸入書名，或請我用說故事方式介紹一本書..."
      : chatMode === "book-guide"
        ? "輸入書名或主題，我會整理成書籍介紹..."
        : "輸入問題...";
  const latestAssistantIndex = messages.reduce(
    (latestIndex, message, index) =>
      message.role === "assistant" ? index : latestIndex,
    -1,
  );
  const latestAssistantMessage =
    latestAssistantIndex >= 0 ? messages[latestAssistantIndex] : null;
  const canShowVoiceControls =
    chatMode === "book-guide" &&
    bookOutputMode === "story" &&
    !loading &&
    latestAssistantMessage !== null;

  // 正在朗讀的訊息索引(每則回覆下方的朗讀鈕用;null = 沒在念)
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);

  // 朗讀用 Gemini TTS(與故事書同一個後端端點、同一把金鑰):
  // - 同一則回覆的語音會快取,重播不重算額度(免費版每天 10 次、每分鐘 3 次)
  // - Gemini 失敗(額度用完、網路問題)時自動退回瀏覽器內建語音,並提示原因
  const [speakLoading, setSpeakLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsCacheRef = useRef<Map<number, string>>(new Map()); // 訊息索引 → 音檔 object URL
  // 朗讀時驅動顏如玉嘴巴的音源(null = 沒在念,嘴巴閉上)
  const [mouthSource, setMouthSource] = useState<MouthSource | null>(null);
  // 音訊分析失敗的警告只在每次載入頁面時印一次
  const lipsyncWarnedRef = useRef(false);

  const speakWithBrowserVoice = (index: number, text: string) => {
    if (!("speechSynthesis" in window)) return;
    // Chrome 引擎若卡在 paused 狀態，cancel/speak 都會被無視：先強制 resume 解鎖
    try {
      window.speechSynthesis.resume();
    } catch (_) {}
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-TW";
    utterance.rate = storyPaceRate[storyPace] ?? 1;
    utterance.pitch = storyTonePitch[storyTone] ?? 1;
    // 內建語音拿不到音量,用假口型(只在真的開始出聲後才設,且只在 speaking 時動嘴);
    // done 只清自己的音源,避免被 cancel() 非同步觸發的舊 utterance 事件把新朗讀的嘴巴關掉
    const fakeSource = createFakeMouthSource(
      undefined,
      () => window.speechSynthesis.speaking,
    );
    const done = () => {
      setVoiceStatus("idle");
      setSpeakingIndex((cur) => (cur === index ? null : cur));
      setMouthSource((cur) => (cur === fakeSource ? null : cur));
    };
    utterance.onstart = () => {
      // 其他角色沒有口型,不必設音源
      if (isYanruyuUrl(modelUrl)) setMouthSource(fakeSource);
    };
    utterance.onend = done;
    utterance.onerror = done;
    window.speechSynthesis.speak(utterance);
    setVoiceStatus("playing");
    setSpeakingIndex(index);
  };

  const speakMessage = async (index: number) => {
    // 必須在任何 await 之前(仍在點擊手勢內)預先喚醒 AudioContext,Safari 才允許
    warmUpAudioContext();
    const text = messages[index]?.content.trim();
    if (!text) return;
    stopVoice();
    setSpeakingIndex(index);
    setSpeakLoading(true);
    try {
      let url = ttsCacheRef.current.get(index);
      if (!url) {
        const res = await fetch(`${API_BASE}/v1/story-book/speak`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) {
          const detail = await res
            .json()
            .then((j) => j?.detail)
            .catch(() => null);
          throw new Error(typeof detail === "string" ? detail : `HTTP ${res.status}`);
        }
        url = URL.createObjectURL(await res.blob());
        ttsCacheRef.current.set(index, url);
      }
      const audio = (audioRef.current ??= new Audio());
      audio.src = url;
      audio.playbackRate = storyPaceRate[storyPace] ?? 1;
      let source: MouthSource | null = null;
      const done = () => {
        setVoiceStatus("idle");
        setSpeakingIndex((cur) => (cur === index ? null : cur));
        setMouthSource((cur) => (cur === source ? null : cur));
      };
      audio.onended = done;
      audio.onerror = done;
      await audio.play();
      // 其他角色沒有口型,不必把音訊接進 Web Audio(也避開 Safari 的 context 風險)
      if (isYanruyuUrl(modelUrl)) {
        // 聲音出來後才接音源:analyser 失敗(或 context 未 running)就退回假口型
        try {
          source = getAnalyserMouthSource(audio);
        } catch (e) {
          if (!lipsyncWarnedRef.current) {
            lipsyncWarnedRef.current = true;
            console.warn("[lipsync] 無法建立音訊分析,改用假口型", e);
          }
          source = createFakeMouthSource(undefined, () => !audio.paused);
        }
        setMouthSource(source);
      } else {
        setMouthSource(null);
      }
      setSpeakLoading(false);
      setVoiceStatus("playing");
    } catch (e) {
      setSpeakLoading(false);
      const msg = e instanceof Error ? e.message : "未知錯誤";
      setToast({ text: `AI 語音暫時無法使用（${msg}），改用內建語音朗讀`, variant: "error" });
      speakWithBrowserVoice(index, text);
    }
  };

  // 複製某則回覆的文字到剪貼簿:先用 Clipboard API,不行再退回舊式 execCommand;回傳是否成功
  const copyMessage = async (index: number): Promise<boolean> => {
    const text = messages[index]?.content ?? "";
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    setToast(
      ok
        ? { text: "已複製回覆內容" }
        : { text: "無法複製，請手動選取文字", variant: "error" },
    );
    return ok;
  };

  // 說故事模式的播放鈕:念最新一則回覆(與每則回覆的朗讀鈕共用同一套語音邏輯)
  const playVoice = () => {
    if (latestAssistantIndex >= 0) speakMessage(latestAssistantIndex);
  };

  /* 下載對話（spec：docs/2026-10-07_下載對話_spec.md）：
     訪談研究用——學生陪長輩聊完，當場把對話存成 txt/csv 帶走分析 */
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const downloadChat = (format: "txt" | "csv") => {
    exportChat(format, {
      page: "聊天問答",
      info: [
        ["AI 人設", personaLabel || "一般"],
        ["模型", currentModel],
      ],
      speakers: { user: "使用者", assistant: "AI 館員" },
      messages: messages.filter((m) => m.kind !== "greeting"),
      filePrefix: "AI館員對話",
    });
    setIsDownloadMenuOpen(false);
  };

  const stopVoice = () => {
    setMouthSource(null);
    if (!("speechSynthesis" in window)) return;
    // Chrome 已知 bug：引擎在 paused 狀態下 cancel() 會被無視、聲音停不下來，
    // 必須先 resume() 解鎖再 cancel()
    try {
      window.speechSynthesis.resume();
    } catch (_) {}
    window.speechSynthesis.cancel();
    // Gemini 語音走 <audio>,一併停掉
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.currentTime = 0;
    }
    setVoiceStatus("idle");
    setSpeakingIndex(null);
    setSpeakLoading(false);
  };

  useEffect(() => {
    const cache = ttsCacheRef.current;
    return () => {
      window.speechSynthesis?.cancel();
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        // 釋放來源與緩衝,元素雖仍接在共用 AudioContext 上也才能被回收
        audio.removeAttribute("src");
        audio.load();
      }
      cache.forEach((url) => URL.revokeObjectURL(url));
      cache.clear();
    };
  }, []);

  useEffect(() => {
    stopVoice();
  }, [bookOutputMode, chatMode]);

  // 上下版面僅在未放大對話區時生效；放大時維持原本行為
  const isStacked = layout === "stacked" && !isChatExpanded;
  const toolsSection = (
    <ToolsSection
      mcpTools={mcpTools}
      selected={selected}
      setSelected={setSelected}
      toolIconMap={toolIconMap}
    />
  );

  return (
    <div
      className={`mx-auto grid min-h-screen w-full max-w-screen-2xl grid-cols-1 px-0 overflow-hidden sm:px-6 ${
        isStacked ? "gap-0" : "gap-4 sm:gap-6 md:grid-cols-3"
      }`}
    >
      {!isChatExpanded && (
        <Live2DArea
          modelUrl={modelUrl}
          setModelUrl={setModelUrl}
          emotionToken={emotionToken}
          paused={isConfigOpen}
          motionSpeed={motionSpeed}
          characterView={characterView}
          layout={layout}
          mouthSource={mouthSource}
        />
      )}

      <section
        className={`card motion-surface flex flex-col p-4 sm:p-6 ${
          isChatExpanded
            ? "h-[calc(100vh-6rem)] md:col-span-3"
            : isStacked
              ? "layout-stacked-chat chat-overlay"
              : "h-[calc(100vh-6rem)] md:col-span-2"
        }`}
      >
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="ui-title font-bold text-[var(--color-text-primary)]">
              對話區
            </h2>
            <p className="ui-sub mt-1 text-[var(--color-text-secondary)]">
              輸入問題 → AI Librarian 回答 → 顯示對話
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isModeBarCollapsed && (
              <ChatModeMenu
                modes={chatModes}
                value={chatMode}
                onChange={(id) => setChatMode(id as typeof chatMode)}
                onExpand={() => setIsModeBarCollapsed(false)}
                autoFocus={modeBarUserCollapsedRef.current}
              />
            )}
            {messages.some((m) => m.kind !== "greeting") && (
              <div className="relative">
                <Popover
                  disabled={isDownloadMenuOpen}
                  content={
                    <div>
                      <p className="mb-1 font-semibold text-[var(--color-text-primary)]">
                        下載對話
                      </p>
                      <p>把這次的對話存成檔案（文字檔或表格檔）。</p>
                    </div>
                  }
                >
                  <button
                    type="button"
                    onClick={() => setIsDownloadMenuOpen((open) => !open)}
                    className="theme-icon-button rounded-lg p-2"
                    aria-label="下載對話"
                  >
                    <Download className="h-5 w-5" />
                  </button>
                </Popover>
                {isDownloadMenuOpen && (
                  <>
                    {/* 點選單外任何地方收起選單 */}
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setIsDownloadMenuOpen(false)}
                    />
                    <div className="theme-modal absolute right-0 top-full z-20 mt-2 w-48 rounded-xl p-2">
                      <button
                        type="button"
                        onClick={() => downloadChat("txt")}
                        className="w-full rounded-lg px-3 py-2 text-left hover:bg-[var(--color-accent-soft)]"
                      >
                        文字檔（.txt）
                        <span className="mt-0.5 block text-xs text-[var(--color-text-muted)]">
                          可貼進 Word 逐句整理
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadChat("csv")}
                        className="w-full rounded-lg px-3 py-2 text-left hover:bg-[var(--color-accent-soft)]"
                      >
                        表格檔（.csv）
                        <span className="mt-0.5 block text-xs text-[var(--color-text-muted)]">
                          Excel 直接開、適合統計
                        </span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            <Popover
              content={
                <div>
                  <p className="mb-1 font-semibold text-[var(--color-text-primary)]">
                    {isChatExpanded ? "還原對話區" : "放大對話區"}
                  </p>
                  <p>
                    {isChatExpanded
                      ? "回到一般版面，顯示角色與工具列表。"
                      : "讓對話區吃滿畫面，方便閱讀較長回覆。"}
                  </p>
                </div>
              }
            >
              <button
                type="button"
                onClick={() => setIsChatExpanded((current) => !current)}
                className="theme-icon-button rounded-lg p-2"
                aria-label={isChatExpanded ? "還原對話區" : "放大對話區"}
              >
                {isChatExpanded ? (
                  <Minimize2 className="h-5 w-5" />
                ) : (
                  <Maximize2 className="h-5 w-5" />
                )}
              </button>
            </Popover>

            <Popover
              content={
                <div>
                  <p className="mb-1 font-semibold text-[var(--color-text-primary)]">
                    模型設定
                  </p>
                  <p>可以調整模型、溫度、max tokens、system prompt。</p>
                </div>
              }
            >
              <button
                onClick={() => setIsConfigOpen(true)}
                className="theme-icon-button rounded-lg p-2"
              >
                <Settings className="w-5 h-5" />
              </button>
            </Popover>
          </div>
        </header>

        {!isModeBarCollapsed && (
          <div className="mb-3 flex items-start gap-2">
            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
              {chatModes.map((mode) => {
                const active = chatMode === mode.id;

                return (
                  <Popover
                    key={mode.id}
                    className="w-full"
                    content={
                      <div className="text-sm text-[var(--color-text-secondary)]">
                        {mode.description}
                      </div>
                    }
                  >
                    <button
                      type="button"
                      onClick={() => setChatMode(mode.id)}
                      className={`flex w-full items-center justify-center rounded-xl border px-4 py-1.5 text-center transition hover:text-[var(--color-text-primary)] ${
                        active
                          ? "border-[var(--color-accent-border)] bg-[var(--color-accent-soft)] text-[var(--color-accent-text)]"
                          : "border-[var(--color-border)] bg-[var(--color-bg-panel)] text-[var(--color-text-secondary)]"
                      }`}
                    >
                      <div className="ui-tab font-semibold">
                        {mode.label}
                      </div>
                    </button>
                  </Popover>
                );
              })}
            </div>
            <Popover
              content={
                <div>
                  <p className="mb-1 font-semibold text-[var(--color-text-primary)]">
                    收合模式列
                  </p>
                  <p>騰出對話空間；收起後可從右上角的模式圖示切換。</p>
                </div>
              }
            >
              <button
                ref={collapseBtnRef}
                type="button"
                onClick={() => {
                  modeBarUserCollapsedRef.current = true;
                  setIsModeBarCollapsed(true);
                }}
                className="theme-icon-button rounded-lg p-2"
                aria-label="收合模式列"
              >
                <ChevronUp className="h-5 w-5" />
              </button>
            </Popover>
          </div>
        )}

        {chatMode === "book-guide" && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {bookOutputModes.map((mode) => {
              const active = bookOutputMode === mode.id;

              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setBookOutputMode(mode.id)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition hover:text-[var(--color-text-primary)] ${
                    active
                      ? "theme-button-accent theme-button-accent-active"
                      : "theme-button-secondary"
                  }`}
                >
                  {mode.label}
                </button>
              );
            })}

            {bookOutputMode === "story" && (
              <Popover
                content={
                  <div>
                    <p className="mb-1 font-semibold text-[var(--color-text-primary)]">
                      語音輸出設定
                    </p>
                    <p>
                      目前：{storyTone}語氣，{storyPace}速
                    </p>
                  </div>
                }
              >
                <button
                  type="button"
                  onClick={() => setIsVoiceSettingsOpen(true)}
                  className="theme-icon-button rounded-full p-2"
                  aria-label="開啟語音輸出設定"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
              </Popover>
            )}
          </div>
        )}

        {isConfigOpen && (
          <ConfigModal
            personaOptions={personaOptions}
            initial={{
              systemPrompt,
              bookGuidePrompt,
              temperature,
              maxTokens,
              motionSpeed,
              characterView,
              layout,
              persona,
              personaModules,
            }}
            onClose={() => setIsConfigOpen(false)}
            onApply={(draft) => {
              applySettings(draft);
              setIsConfigOpen(false);
            }}
          />
        )}

        {toast && (
          <Toast
            message={toast.text}
            variant={toast.variant}
            onDone={() => setToast(null)}
          />
        )}

        {isVoiceSettingsOpen && (
          <VoiceSettingsModal
            tone={storyTone}
            pace={storyPace}
            onToneChange={setStoryTone}
            onPaceChange={setStoryPace}
            onClose={() => setIsVoiceSettingsOpen(false)}
          />
        )}

        {!messages.some((m) => m.kind !== "greeting") && suggestedQuestions.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {suggestedQuestions.map((q, i) => (
              <button
                key={i}
                onClick={() => handleSend(q)}
                className="msg-text-sm theme-button-accent motion-button inline-flex items-center gap-1.5 rounded-lg px-3 py-1"
              >
                <MessageCircleQuestionMark className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />
                {q}
              </button>
            ))}
          </div>
        )}

        <MessageList
          messages={messages}
          followUpQuestions={followUpQuestions}
          pendingStatus={pendingStatus}
          onFollowUpClick={(q) => handleSend(q)}
          onCopy={copyMessage}
          onSpeak={speakMessage}
          onStopSpeak={stopVoice}
          speakingIndex={speakingIndex}
          speakLoading={speakLoading}
          assistantActions={
            canShowVoiceControls
              ? {
                  messageIndex: latestAssistantIndex,
                  controls: (
                    <div className="flex shrink-0 gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-1">
                      <button
                        type="button"
                        onClick={playVoice}
                        className="theme-icon-button rounded-full p-1.5"
                        aria-label={
                          "播放語音"
                        }
                      >
                        <Play className="h-3.5 w-3.5" />
                      </button>
                      {/* 暫停鈕暫時下架：瀏覽器內建語音引擎的 pause() 對中文雲端聲線
                          無效（Chrome 引擎層 bug），壞按鈕比沒按鈕更誤導長輩。
                          待說故事改接 Gemini TTS（語音統一）後，整組換成迷你播放器。 */}
                      <button
                        type="button"
                        onClick={stopVoice}
                        disabled={voiceStatus === "idle"}
                        className="theme-icon-button rounded-full p-1.5 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="停止語音"
                      >
                        <Square className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ),
                }
              : undefined
          }
        />

        <ChatInput
          input={input}
          setInput={setInput}
          onSend={(msg) => handleSend(msg)}
          loading={loading}
          placeholder={inputPlaceholder}
        />
      </section>

      {/* 下方工具列表區域 */}
      {!isChatExpanded &&
        (isStacked ? (
          // 上下版面 gap 為 0，工具列表自行留出上方間距
          <div className="mt-6">{toolsSection}</div>
        ) : (
          toolsSection
        ))}
    </div>
  );
}

function VoiceSettingsModal({
  tone,
  pace,
  onToneChange,
  onPaceChange,
  onClose,
}: {
  tone: string;
  pace: string;
  onToneChange: (value: string) => void;
  onPaceChange: (value: string) => void;
  onClose: () => void;
}) {
  // 以 portal 掛到 body：上下版面的對話卡自成 stacking context（z-20），
  // 不 portal 的話 z-50 只在卡片內有效，會被 sticky Navbar 蓋住
  return createPortal(
    <div className="theme-overlay fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="theme-modal w-full max-w-md rounded-xl p-6 shadow-xl">
        <div className="mb-5 flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-[var(--color-accent-text)]" />
          <h3 className="text-lg font-bold text-[var(--color-text-primary)]">
            語音輸出設定
          </h3>
        </div>

        <div className="space-y-5">
          <StorySettingRow
            label="故事語氣"
            options={storySettings.tone}
            selected={tone}
            onSelect={onToneChange}
          />
          <StorySettingRow
            label="語速"
            options={storySettings.pace}
            selected={pace}
            onSelect={onPaceChange}
          />
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="theme-button-primary rounded-lg px-4 py-2"
          >
            完成
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function StorySettingRow({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-[var(--color-text-primary)]">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onSelect(option)}
            className={`rounded-full px-4 py-2 text-sm ${
              option === selected
                ? "theme-button-accent theme-button-accent-active"
                : "theme-button-secondary"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
