import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Mic, Square, SendHorizontal } from "lucide-react";

type Props = {
  input: string; // 目前輸入的文字
  setInput: Dispatch<SetStateAction<string>>; // 更新輸入內容
  onSend: (customInput?: string) => void;
  loading: boolean; // 是否為處理中（顯示 loading）
  placeholder?: string;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: any) => void) | null;
  start: () => void;
  stop: () => void;
};

export default function ChatInput({
  input,
  setInput,
  onSend,
  loading,
  placeholder = "輸入問題...",
}: Props) {
  // 用來偵測中文輸入法是否正在組字（避免誤送出）
  const composingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechBaseRef = useRef("");
  const speechFinalRef = useRef("");
  const stopRequestedRef = useRef(false);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);

  // 輸入框隨內容自動長高：最多 3 行，超過改出捲軸（打字與語音輸入都會經過 input 變化）
  const autoSize = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const cs = getComputedStyle(ta);
    const lineHeight = parseFloat(cs.lineHeight) || 24;
    const extra =
      parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) +
      parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const maxHeight = lineHeight * 3 + extra;
    ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`;
    ta.style.overflowY = ta.scrollHeight > maxHeight ? "auto" : "hidden";
  };
  useEffect(autoSize, [input]);

  // 停止語音輸入並清空累積的講稿（避免下一次輸入殘留上一次的內容）
  const stopMic = () => {
    stopRequestedRef.current = true;
    speechFinalRef.current = "";
    speechBaseRef.current = "";
    try {
      recognitionRef.current?.stop();
    } catch (_) {}
    setListening(false);
  };

  // 任何送出（按鈕/Enter/建議問題/延伸問題）都會讓 loading 變 true：
  // 這時自動關麥克風，使用者不用記得手動按停止
  useEffect(() => {
    if (loading) stopMic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);
  // A+/A- 改字體大小後行高會變，也要重算（FontSizeController 會廣播這個事件）
  useEffect(() => {
    const onFontChange = () => requestAnimationFrame(autoSize);
    window.addEventListener("font-size-change", onFontChange);
    return () => window.removeEventListener("font-size-change", onFontChange);
  }, []);

  // 載入瞬間版面還沒排定、輸入框可能暫時很窄，量到的高度是假的：
  // 等排版穩定後補量一次；視窗大小改變（換行位置變）也要重量
  useEffect(() => {
    const raf1 = requestAnimationFrame(() => requestAnimationFrame(autoSize));
    window.addEventListener("resize", autoSize);
    return () => {
      cancelAnimationFrame(raf1);
      window.removeEventListener("resize", autoSize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 初始化 SpeechRecognition（Chrome/Edge）
  useEffect(() => {
    const SpeechCtor =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechCtor) {
      setSpeechSupported(false);
      return;
    }

    const recognition: SpeechRecognitionLike = new SpeechCtor();
    recognition.lang = "zh-TW";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res?.isFinal && res[0]?.transcript) {
          const next = res[0].transcript.trim();
          if (next) {
            speechFinalRef.current = speechFinalRef.current
              ? `${speechFinalRef.current} ${next}`
              : next;
          }
        } else if (res?.[0]?.transcript) {
          interim = res[0].transcript;
        }
      }
      const combined = `${speechFinalRef.current} ${interim}`.trim();
      const base = speechBaseRef.current.trim();
      setInput(combined ? (base ? `${base} ${combined}` : combined) : base);
    };

    recognition.onend = () => {
      if (!stopRequestedRef.current) {
        try {
          recognition.start();
          setListening(true);
          return;
        } catch (_) {}
      }
      setListening(false);
    };
    recognition.onerror = (event: any) => {
      // 使用者拒絕麥克風權限：停止並標記不支援，不然會無限重啟一直跳權限請求
      if (event?.error === "not-allowed" || event?.error === "service-not-allowed") {
        stopRequestedRef.current = true;
        setSpeechSupported(false);
        setListening(false);
        return;
      }
      if (!stopRequestedRef.current) {
        try {
          recognition.start();
          setListening(true);
          return;
        } catch (_) {}
      }
      setListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.stop?.();
      recognitionRef.current = null;
    };
  }, [setInput]);

  const toggleMic = () => {
    const recognition = recognitionRef.current;
    if (!speechSupported || !recognition) return;

    if (listening) {
      stopRequestedRef.current = true;
      recognition.stop();
      setListening(false);
      return;
    }

    try {
      stopRequestedRef.current = false;
      speechBaseRef.current = input;
      speechFinalRef.current = "";
      recognition.start();
      setListening(true);
    } catch (_) {}
  };

  return (
    <div className="mt-3 flex items-end gap-2">
      {/* 輸入區：支援 Shift+Enter 換行，避免中文輸入 Enter 誤觸；隨內容長高、最多 3 行 */}
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onCompositionStart={() => (composingRef.current = true)}
        onCompositionEnd={() => (composingRef.current = false)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          if (e.shiftKey) return;

          const isComposing =
            (e as any).nativeEvent?.isComposing ||
            composingRef.current ||
            (e as any).keyCode === 229;

          if (isComposing) return;

          e.preventDefault();
          onSend();
        }}
        placeholder={placeholder}
        rows={1}
        className="theme-input min-h-9 flex-1 resize-none overflow-hidden rounded-lg px-3 py-1.5 leading-normal no-underline"
      />

      <button
        type="button"
        onClick={toggleMic}
        disabled={!speechSupported}
        className={`
          theme-button-accent flex h-9 w-12 items-center justify-center rounded-lg
          ${listening ? "theme-button-accent-active" : ""}
          disabled:cursor-not-allowed disabled:opacity-40
        `}
        aria-pressed={listening}
        aria-label={listening ? "停止語音輸入" : "開始語音輸入"}
        title={speechSupported ? (listening ? "停止" : "語音") : "不支援語音輸入"}
      >
        {listening ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
      </button>

      <button
        onClick={() => onSend()}
        disabled={loading}
        aria-label="送出"
        className="theme-button-accent flex h-9 w-12 items-center justify-center rounded-lg text-sm disabled:opacity-50 sm:w-20"
      >
        {loading ? (
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline">處理中</span>
            <div className="h-4 w-4 rounded-full border-2 border-sky-300 border-t-transparent animate-spin"></div>
          </div>
        ) : (
          <>
            <SendHorizontal className="h-4 w-4 sm:hidden" />
            <span className="hidden sm:inline">送出</span>
          </>
        )}
      </button>
    </div>
  );
}
