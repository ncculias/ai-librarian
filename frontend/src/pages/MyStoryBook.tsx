import { useState, useRef, useEffect, useCallback } from "react";
import {
  Camera,
  Check,
  RefreshCw,
  Volume2,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Feather,
  BookOpen,
  Loader2,
  Palette,
  Image as ImageIcon,
  MessageCircleMore,
} from "lucide-react";
// 直接打 localhost:8000（與 useLLMStream.ts 相同；瀏覽器連得到後端發佈的埠）
const API_BASE = "http://localhost:8000";

/**
 * 「我的故事書」：上傳照片 → AI 看圖寫故事 → 翻頁電子書
 * --------------------------------------------------
 * 流程：開始 → 選 3～5 張照片 → 確認 → 生成中(真的呼叫後端) → 翻頁書
 * - 照片：使用者上傳的真照片
 * - 故事：呼叫後端 POST /v1/story-book/generate（gpt-4o-mini 看圖生成）
 * - 朗讀：後端 Gemini TTS（/v1/story-book/speak），前端迷你播放器（進度/語速/連續唸）
 * - 樣式沿用網站設計系統（card / chip / theme-button / --color-* 變數）
 */

type Step = "home" | "confirm" | "generating" | "book";

/* 書本工作階段（2026-09-23）：
   原本故事存在頁面元件的 state，切到聊天問答再回來（元件重建）就全部消失。
   搬到模組層級後，同一個分頁內切換路由都會保留：照片、故事、頁碼、插畫、語音快取
   （語音保留特別重要——不用重新呼叫 TTS 扣額度）。重新整理瀏覽器仍會清空（屬預期）。 */
const bookSession: {
  step: Step;
  photos: Photo[];
  story: StoryBook | null;
  page: number;
  illustMode: boolean;
  illustMap: Record<string, string>;
  audioCache: Map<string, string> | null;
} = {
  step: "home",
  photos: [],
  story: null,
  page: 0,
  illustMode: false,
  illustMap: {},
  audioCache: null,
};

function resetBookSession() {
  bookSession.photos.forEach((p) => URL.revokeObjectURL(p.url));
  bookSession.audioCache?.forEach((url) => URL.revokeObjectURL(url));
  bookSession.step = "home";
  bookSession.photos = [];
  bookSession.story = null;
  bookSession.page = 0;
  bookSession.illustMode = false;
  bookSession.illustMap = {};
  bookSession.audioCache = null;
}

type Photo = { url: string; file: File };

type StoryPage = { photo_index: number; heading: string; text: string };
type StoryBook = {
  title: string;
  subtitle: string;
  pages: StoryPage[];
  closing?: string;
};

const STORY_ENDING_FALLBACK =
  "謝謝這段故事，謝謝照片裡的每一刻。未來的日子，也要繼續留下更多美好的回憶。";

const MIN_PHOTOS = 3;
const MAX_PHOTOS = 5;

// 極短的無聲音檔，用來在使用者手勢中「解鎖」播放器（繞過 Safari 自動播放限制）
const SILENT_AUDIO =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

// File → base64 data URL（"data:image/jpeg;base64,..."）
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function MyStoryBook() {
  const [step, setStep] = useState<Step>(() =>
    bookSession.step === "generating" ? "confirm" : bookSession.step
  );
  const [photos, setPhotos] = useState<Photo[]>(() => bookSession.photos);
  const [story, setStory] = useState<StoryBook | null>(() => bookSession.story);
  const [errorMsg, setErrorMsg] = useState("");
  const [page, setPage] = useState(() => bookSession.page);

  // 任何變更即時同步回工作階段（切走再切回來就能原樣還原）
  useEffect(() => {
    bookSession.step = step;
    bookSession.photos = photos;
    bookSession.story = story;
    bookSession.page = page;
  }, [step, photos, story, page]);
  const fileRef = useRef<HTMLInputElement>(null);
  // 全程共用同一個播放器元件；在使用者手勢中解鎖一次，之後就能自由播放
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const clearPhotos = useCallback(() => {
    setPhotos((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.url));
      return [];
    });
  }, []);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS);
    clearPhotos();
    setPhotos(files.map((f) => ({ url: URL.createObjectURL(f), file: f })));
    if (files.length > 0) setStep("confirm");
    e.target.value = "";
  };

  // 真的呼叫後端：把照片 POST 過去，拿回 AI 寫的故事
  const startGenerate = async () => {
    setErrorMsg("");
    // 趁這個使用者手勢，先解鎖播放器（播一段無聲音檔），之後朗讀才不會被瀏覽器擋
    if (!audioElRef.current) audioElRef.current = new Audio();
    const el = audioElRef.current;
    el.src = SILENT_AUDIO;
    el.play().then(() => el.pause()).catch(() => {});

    setStep("generating");
    try {
      // 照片轉成 base64 data URL，用 JSON 傳（後端不需 multipart 套件）
      const dataUrls = await Promise.all(photos.map((p) => fileToDataUrl(p.file)));
      const res = await fetch(`${API_BASE}/v1/story-book/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: dataUrls }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: StoryBook = await res.json();
      // 新書上架：上一本的插畫與語音快取作廢
      bookSession.illustMap = {};
      bookSession.illustMode = false;
      bookSession.audioCache?.forEach((url) => URL.revokeObjectURL(url));
      bookSession.audioCache = null;
      setStory(data);
      setPage(0);
      setStep("book");
    } catch (err) {
      console.error(err);
      setErrorMsg("生成故事失敗了，請再試一次。");
      setStep("confirm");
    }
  };

  const reset = () => {
    clearPhotos();
    resetBookSession();
    setStory(null);
    setPage(0);
    setErrorMsg("");
    setStep("home");
  };

  return (
    <div className="mx-auto max-w-5xl">
      <style>{MSB_CSS}</style>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onPick}
      />

      {step === "home" && <HomeStep onStart={() => fileRef.current?.click()} />}

      {step === "confirm" && (
        <ConfirmStep
          photos={photos}
          errorMsg={errorMsg}
          onConfirm={startGenerate}
          onReselect={() => fileRef.current?.click()}
        />
      )}

      {step === "generating" && <GeneratingStep />}

      {step === "book" && story && (
        <BookStep
          photos={photos}
          story={story}
          page={page}
          setPage={setPage}
          onRestart={reset}
          audioElRef={audioElRef}
        />
      )}
    </div>
  );
}

/* ---------- 畫面 1：開始 ---------- */
function HomeStep({ onStart }: { onStart: () => void }) {
  return (
    <section className="card flex flex-col items-center gap-8 px-6 py-16 text-center">
      <div className="chip w-fit">
        <BookOpen className="h-4 w-4" /> 我的故事書
      </div>
      <h1 className="text-4xl font-bold leading-snug text-[var(--color-text-primary)] sm:text-5xl">
        把你的照片
        <br />
        變成一本故事書
      </h1>
      <p className="max-w-md text-xl leading-9 text-[var(--color-text-secondary)]">
        選 {MIN_PHOTOS}～{MAX_PHOTOS} 張照片，我幫你寫成一段溫暖的故事，還能念給你聽。
      </p>
      <button
        onClick={onStart}
        className="theme-button-accent flex items-center gap-3 rounded-full px-10 py-6 text-2xl font-semibold shadow-lg"
      >
        <Camera className="h-7 w-7" /> 做一本我的故事書
      </button>
    </section>
  );
}

/* ---------- 畫面 2：確認照片 ---------- */
function ConfirmStep({
  photos,
  errorMsg,
  onConfirm,
  onReselect,
}: {
  photos: Photo[];
  errorMsg: string;
  onConfirm: () => void;
  onReselect: () => void;
}) {
  const ok = photos.length >= MIN_PHOTOS && photos.length <= MAX_PHOTOS;
  return (
    <section className="card flex flex-col items-center gap-7 px-6 py-12 text-center">
      <h2 className="text-3xl font-bold text-[var(--color-text-primary)]">
        這 {photos.length} 張，可以嗎？
      </h2>
      <div className="flex flex-wrap justify-center gap-4">
        {photos.map((p, i) => (
          <img
            key={i}
            src={p.url}
            alt={`照片 ${i + 1}`}
            className="h-40 w-40 rounded-2xl object-cover shadow-md"
          />
        ))}
      </div>
      {!ok && (
        <p className="text-lg text-[var(--color-text-secondary)]">
          請選 {MIN_PHOTOS} 到 {MAX_PHOTOS} 張照片喔
        </p>
      )}
      {errorMsg && <p className="text-lg font-semibold text-red-500">{errorMsg}</p>}
      <div className="flex flex-col gap-4 sm:flex-row">
        <button
          onClick={onConfirm}
          disabled={!ok}
          className="theme-button-accent flex items-center gap-2 rounded-full px-9 py-5 text-xl font-semibold disabled:opacity-40"
        >
          <Check className="h-6 w-6" /> 就用這些，幫我寫故事
        </button>
        <button
          onClick={onReselect}
          className="theme-button-secondary flex items-center gap-2 rounded-full px-9 py-5 text-xl"
        >
          <RefreshCw className="h-5 w-5" /> 重新選
        </button>
      </div>
    </section>
  );
}

/* ---------- 畫面 3：生成中 ---------- */
function GeneratingStep() {
  return (
    <section className="card flex flex-col items-center gap-7 px-6 py-24 text-center">
      <Feather className="msb-pulse h-16 w-16 text-[var(--color-accent-strong)]" />
      <h2 className="text-3xl font-bold text-[var(--color-text-primary)]">
        正在幫你寫故事…
      </h2>
      <p className="text-xl text-[var(--color-text-secondary)]">
        AI 正在看你的照片，請稍等一下下
      </p>
    </section>
  );
}

/* ---------- 畫面 4：翻頁電子書 ---------- */
function BookStep({
  photos,
  story,
  page,
  setPage,
  onRestart,
  audioElRef,
}: {
  photos: Photo[];
  story: StoryBook;
  page: number;
  setPage: (n: number) => void;
  onRestart: () => void;
  audioElRef: React.MutableRefObject<HTMLAudioElement | null>;
}) {
  type Screen =
    | { type: "cover" }
    | { type: "story"; photo: string; heading: string; text: string }
    | { type: "end" };

  // 每頁用 AI 決定的 photo_index 對應照片（AI 可能重新編排順序）；
  // index 無效時退回該頁序號，確保不會壞掉
  const n = Math.min(photos.length, story.pages.length);
  const storyScreens = Array.from({ length: n }, (_, i) => {
    const pi = story.pages[i].photo_index;
    const idx = typeof pi === "number" && pi >= 0 && pi < photos.length ? pi : i;
    return {
      type: "story" as const,
      photo: photos[idx].url,
      heading: story.pages[i].heading,
      text: story.pages[i].text,
    };
  });
  const coverPhoto = storyScreens[0]?.photo ?? photos[0]?.url;
  const screens: Screen[] = [
    { type: "cover" },
    ...storyScreens,
    { type: "end" },
  ];
  const total = screens.length;
  const cur = Math.min(page, total - 1);
  const screen = screens[cur];

  // 繪本插畫模式：把照片重繪成插畫（文字不變，只換圖）
  const [illustMode, setIllustMode] = useState(() => bookSession.illustMode);
  const [illustMap, setIllustMap] = useState<Record<string, string>>(
    () => bookSession.illustMap
  ); // 原圖url → 插畫dataURL
  useEffect(() => {
    bookSession.illustMode = illustMode;
    bookSession.illustMap = illustMap;
  }, [illustMode, illustMap]);
  const [illustProgress, setIllustProgress] = useState<{ done: number; total: number } | null>(null);
  const hasIllust = Object.keys(illustMap).length > 0;
  const resolvePhoto = (url: string) =>
    illustMode && illustMap[url] ? illustMap[url] : url;

  const illustrateAll = async () => {
    if (illustProgress) return;
    setIllustProgress({ done: 0, total: photos.length });
    setIllustMode(true);
    let done = 0;
    let idx = 0;
    const CONCURRENCY = 2;
    const worker = async () => {
      while (idx < photos.length) {
        const p = photos[idx++];
        try {
          const dataUrl = await fileToDataUrl(p.file);
          const res = await fetch(`${API_BASE}/v1/story-book/illustrate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ photo: dataUrl }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const j: { image: string } = await res.json();
          setIllustMap((prev) => ({ ...prev, [p.url]: j.image }));
        } catch (e) {
          console.error(e);
        } finally {
          done++;
          setIllustProgress({ done, total: photos.length });
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setIllustProgress(null);
  };

  // 結尾文字：用 AI 寫的專屬結尾語（不再重複最後一頁），沒有才用 fallback
  const endingText = story.closing?.trim() || STORY_ENDING_FALLBACK;

  const readText =
    screen.type === "story"
      ? screen.text
      : screen.type === "end"
      ? endingText
      : `${story.title}。${story.subtitle}`;

  // 朗讀：後端 Gemini TTS 真人聲。背景預先生成 + 快取，點下去通常立即播。
  // 播放用 audioElRef（父層已在使用者手勢中解鎖的同一個播放器），避免被瀏覽器擋。
  const cacheRef = useRef<Map<string, string>>(
    bookSession.audioCache ?? (bookSession.audioCache = new Map())
  ); // 文字 → 音檔 objectURL（存於工作階段，切頁保留）
  const inflightRef = useRef<Map<string, Promise<string>>>(new Map()); // 進行中的請求（去重）
  const [audioState, setAudioState] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const [progress, setProgress] = useState({ t: 0, d: 0 }); // 播放進度（秒）/ 總長
  // 語速與「連續唸」跨頁共用，並記住上次的選擇
  const RATE_STEPS = [1, 1.25, 1.5, 0.75];
  const [rate, setRate] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem("msb-rate"));
      return RATE_STEPS.includes(v) ? v : 1;
    } catch {
      return 1;
    }
  });
  const [autoNext, setAutoNext] = useState<boolean>(() => {
    try {
      return localStorage.getItem("msb-autonext") === "1";
    } catch {
      return false;
    }
  });
  // onended 回呼裡要讀到「當下」的值，用 ref 鏡射避免閉包吃到舊值
  const rateRef = useRef(rate);
  const autoNextRef = useRef(autoNext);
  const curRef = useRef(cur);
  const autoPlayRef = useRef(false); // 連續唸：翻頁後自動接著播的旗標
  useEffect(() => {
    rateRef.current = rate;
    if (audioElRef.current) audioElRef.current.playbackRate = rate;
    try {
      localStorage.setItem("msb-rate", String(rate));
    } catch {
      /* 存不了就算了 */
    }
  }, [rate, audioElRef]);
  useEffect(() => {
    autoNextRef.current = autoNext;
    try {
      localStorage.setItem("msb-autonext", autoNext ? "1" : "0");
    } catch {
      /* 存不了就算了 */
    }
  }, [autoNext]);
  useEffect(() => {
    curRef.current = cur;
  }, [cur]);

  const ensureAudio = useCallback(() => {
    const a = audioElRef.current ?? new Audio();
    audioElRef.current = a;
    return a;
  }, [audioElRef]);

  // 掛進度監聽：播放中即時更新進度條
  useEffect(() => {
    const a = ensureAudio();
    const onTime = () =>
      setProgress({ t: a.currentTime, d: Number.isFinite(a.duration) ? a.duration : 0 });
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onTime);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onTime);
    };
  }, [ensureAudio]);

  // 取得某段文字的音檔網址：已快取直接回；進行中的共用同一個請求；否則向後端要
  const fetchAudioUrl = useCallback((text: string): Promise<string> => {
    const cached = cacheRef.current.get(text);
    if (cached) return Promise.resolve(cached);
    const inflight = inflightRef.current.get(text);
    if (inflight) return inflight;
    const p = (async () => {
      const res = await fetch(`${API_BASE}/v1/story-book/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        // 後端會用 detail 帶人話（例如額度用完），拿得到就顯示它
        const detail = await res
          .json()
          .then((j) => j?.detail)
          .catch(() => null);
        throw new Error(detail || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      cacheRef.current.set(text, url);
      return url;
    })();
    inflightRef.current.set(text, p);
    p.finally(() => inflightRef.current.delete(text));
    return p;
  }, []);

  const stopAudio = useCallback(() => {
    audioElRef.current?.pause();
    setAudioState("idle");
    setProgress({ t: 0, d: 0 });
  }, [audioElRef]);

  const playUrl = useCallback(
    (url: string) => {
      // 重複使用同一個（已解鎖的）播放器元件
      const audio = ensureAudio();
      audio.onended = () => {
        // 連續唸開著且還有下一頁：翻頁並接著唸；否則停在結尾（可拖回去重聽）
        if (autoNextRef.current && curRef.current < total - 1) {
          autoPlayRef.current = true;
          setPage(curRef.current + 1);
        } else {
          setAudioState("paused");
        }
      };
      audio.onerror = () => setAudioState("idle");
      audio.src = url;
      audio.playbackRate = rateRef.current;
      return audio.play().then(() => setAudioState("playing"));
    },
    [ensureAudio, setPage, total]
  );

  const handlePlayError = (err: unknown) => {
    console.error(err);
    stopAudio();
    const msg = err instanceof Error ? err.message : "未知錯誤";
    alert("朗讀失敗了：" + msg);
  };

  const onPlayPause = () => {
    const audio = ensureAudio();
    if (audioState === "playing") {
      // 暫停（不是停止）：進度留著，隨時接著聽
      audio.pause();
      setAudioState("paused");
      return;
    }
    if (audioState === "loading") return;
    if (audioState === "paused" && audio.src) {
      // 已唸到結尾再按播放＝從頭重聽
      if (audio.duration && audio.currentTime >= audio.duration - 0.05) audio.currentTime = 0;
      audio.playbackRate = rateRef.current;
      audio.play().then(() => setAudioState("playing")).catch(handlePlayError);
      return;
    }

    const cachedUrl = cacheRef.current.get(readText);
    if (cachedUrl) {
      // 已快取：手勢內直接播
      playUrl(cachedUrl).catch(handlePlayError);
      return;
    }
    // 還沒做好：做好後用同一個（已解鎖）元件播放
    setAudioState("loading");
    fetchAudioUrl(readText)
      .then((url) => playUrl(url))
      .catch(handlePlayError);
  };

  // 進度條拖曳：直接跳到指定秒數
  const onSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = ensureAudio();
    const v = Number(e.target.value);
    audio.currentTime = v;
    setProgress((p) => ({ ...p, t: v }));
  };

  const cycleRate = () =>
    setRate((r) => RATE_STEPS[(RATE_STEPS.indexOf(r) + 1) % RATE_STEPS.length]);

  const fmtTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  // 連續唸：翻到新頁後自動接著播（旗標由上一頁的 onended 設定）
  useEffect(() => {
    if (!autoPlayRef.current) return;
    autoPlayRef.current = false;
    setAudioState("loading");
    fetchAudioUrl(readText)
      .then((url) => playUrl(url))
      .catch(() => setAudioState("idle"));
  }, [readText, fetchAudioUrl, playUrl]);

  // 故事一出來，背景「並行」把每頁語音先做好（一次跑 3 段，大幅縮短整體等待）
  useEffect(() => {
    let cancelled = false;
    const texts = [
      `${story.title}。${story.subtitle}`,
      ...story.pages.map((p) => p.text),
      story.closing?.trim() || STORY_ENDING_FALLBACK,
    ];
    // 免費版 Gemini TTS 約每分鐘只能 3 次，預先生成改成單線排隊＋間隔，
    // 把額度留給使用者當下點的那頁（點擊會與排隊中的請求共用、不會重複扣額度）
    let next = 0;
    const worker = async () => {
      while (!cancelled && next < texts.length) {
        const t = texts[next++];
        try {
          await fetchAudioUrl(t);
        } catch {
          /* 預先生成失敗就算了，使用者點時會再試 */
        }
        if (!cancelled && next < texts.length) {
          await new Promise((r) => setTimeout(r, 21000));
        }
      }
    };
    worker();
    return () => {
      cancelled = true;
    };
  }, [story, fetchAudioUrl]);

  // 翻到哪一頁，就優先把那頁的語音先做好（插隊）
  useEffect(() => {
    fetchAudioUrl(readText).catch(() => {});
  }, [readText, fetchAudioUrl]);

  // 翻頁時停止上一段朗讀
  useEffect(() => {
    return () => stopAudio();
  }, [cur, stopAudio]);

  // 離開書本時只停止播放；音檔快取交給工作階段保管（reset/生成新書時才釋放），
  // 切去聊天問答再回來不用重新呼叫 TTS 扣額度
  useEffect(() => {
    const el = audioElRef.current;
    return () => {
      el?.pause();
    };
  }, [audioElRef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 在聊天輸入框打字時，左右鍵是在移游標，不要翻頁
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowRight" && cur < total - 1) setPage(cur + 1);
      if (e.key === "ArrowLeft" && cur > 0) setPage(cur - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cur, total, setPage]);

  /* ---- 繪本回憶問答：AI 引導長輩聊這本書（詳見 docs/2026-09-11 規劃書）---- */
  type ChatMsg = { role: "user" | "assistant"; content: string };
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSpeakingIdx, setChatSpeakingIdx] = useState<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // 有新訊息時捲到最下面
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [chatMsgs, chatLoading]);

  const chatCall = useCallback(
    async (msgs: ChatMsg[]): Promise<string> => {
      // 當前頁的照片轉 data URL 一起送，AI 才能就照片細節提問
      const screenNow = screens[curRef.current];
      let photoData: string | undefined;
      if (screenNow?.type === "story") {
        const pf = photos.find((p) => p.url === screenNow.photo)?.file;
        if (pf) photoData = await fileToDataUrl(pf);
      }
      const pageIndex = Math.max(0, Math.min(curRef.current - 1, story.pages.length - 1));
      const res = await fetch(`${API_BASE}/v1/story-book/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ story, page_index: pageIndex, messages: msgs, photo: photoData }),
      });
      if (!res.ok) {
        const detail = await res
          .json()
          .then((j) => j?.detail)
          .catch(() => null);
        throw new Error(detail || `HTTP ${res.status}`);
      }
      const j: { reply: string } = await res.json();
      return j.reply;
    },
    [screens, photos, story]
  );

  const openChat = () => {
    setChatOpen(true);
    if (chatMsgs.length > 0 || chatLoading) return;
    // 第一次打開：請 AI 先開口
    setChatLoading(true);
    chatCall([])
      .then((reply) => setChatMsgs([{ role: "assistant", content: reply }]))
      .catch(() =>
        setChatMsgs([{ role: "assistant", content: "我在這裡陪你聊這本書，想從哪張照片聊起呢？" }])
      )
      .finally(() => setChatLoading(false));
  };

  const sendChat = () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    const next: ChatMsg[] = [...chatMsgs, { role: "user", content: text }];
    setChatMsgs(next);
    setChatInput("");
    setChatLoading(true);
    chatCall(next)
      .then((reply) => setChatMsgs((prev) => [...prev, { role: "assistant", content: reply }]))
      .catch((e) =>
        setChatMsgs((prev) => [
          ...prev,
          { role: "assistant", content: `（哎呀，剛剛沒聽清楚：${e instanceof Error ? e.message : "請再說一次"}）` },
        ])
      )
      .finally(() => setChatLoading(false));
  };

  // 唸出某一句 AI 回話：共用語音快取與同一個播放器元件（同時只會有一個聲音）
  const chatSpeak = (idx: number, text: string) => {
    const audio = ensureAudio();
    if (chatSpeakingIdx === idx) {
      audio.pause();
      setChatSpeakingIdx(null);
      return;
    }
    stopAudio();
    setChatSpeakingIdx(idx);
    fetchAudioUrl(text)
      .then((url) => {
        audio.onended = () => setChatSpeakingIdx(null);
        audio.onerror = () => setChatSpeakingIdx(null);
        audio.src = url;
        audio.playbackRate = rateRef.current;
        return audio.play();
      })
      .catch((e) => {
        setChatSpeakingIdx(null);
        alert("朗讀失敗了：" + (e instanceof Error ? e.message : "未知錯誤"));
      });
  };

  // 還沒開始聽：一顆「念給我聽」；按下去原地展開成迷你播放器（同位置、不跳版）
  const ReadButton =
    audioState === "idle" ? (
      <button className="msb-read" onClick={onPlayPause}>
        <Volume2 className="h-5 w-5" /> 念給我聽
      </button>
    ) : (
      <div className="msb-player">
        <button
          className="msb-player-btn"
          onClick={onPlayPause}
          aria-label={audioState === "playing" ? "暫停" : "播放"}
        >
          {audioState === "loading" ? (
            <Loader2 className="h-5 w-5 msb-spin" />
          ) : audioState === "playing" ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5" />
          )}
        </button>
        <input
          type="range"
          className="msb-player-bar"
          min={0}
          max={progress.d || 0}
          step={0.1}
          value={Math.min(progress.t, progress.d || 0)}
          disabled={!progress.d}
          onChange={onSeek}
          aria-label="播放進度"
        />
        <span className="msb-player-time">
          {fmtTime(progress.t)} / {fmtTime(progress.d)}
        </span>
        <button className="msb-player-rate" onClick={cycleRate} aria-label="調整語速">
          {rate}x
        </button>
        <button
          className={"msb-player-auto" + (autoNext ? " on" : "")}
          onClick={() => setAutoNext((v) => !v)}
          aria-label="唸完自動翻頁"
        >
          連續唸
        </button>
      </div>
    );

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="msb-book card" key={cur}>
        {screen.type === "cover" && (
          <div className="msb-cover">
            <img src={resolvePhoto(coverPhoto)} alt="封面" className="msb-cover-img" />
            <div className="msb-cover-text">
              <h1>{story.title}</h1>
              <p>{story.subtitle}</p>
            </div>
          </div>
        )}

        {screen.type === "story" && (
          <div className="msb-story">
            <img src={resolvePhoto(screen.photo)} alt={screen.heading} className="msb-story-img" />
            <div className="msb-story-text">
              <h2>{screen.heading}</h2>
              <p>{screen.text}</p>
              {ReadButton}
            </div>
          </div>
        )}

        {screen.type === "end" && (
          <div className="msb-end">
            <h2>謝謝這趟故事</h2>
            <p>{endingText}</p>
            {ReadButton}
            <button onClick={onRestart} className="theme-button-secondary mt-2 rounded-full px-7 py-4 text-lg">
              📖 再做一本
            </button>
          </div>
        )}
      </div>

      {/* 繪本插畫：把照片變插畫（文字不變）/ 真實照片切換 */}
      <div className="msb-illust">
        {illustProgress ? (
          <span className="msb-illust-status">
            <Loader2 className="h-5 w-5 msb-spin" /> 正在把照片畫成繪本插畫…{" "}
            {illustProgress.done}/{illustProgress.total}
          </span>
        ) : hasIllust ? (
          <button className="msb-illust-btn" onClick={() => setIllustMode((v) => !v)}>
            {illustMode ? (
              <>
                <ImageIcon className="h-5 w-5" /> 看真實照片
              </>
            ) : (
              <>
                <Palette className="h-5 w-5" /> 看繪本插畫
              </>
            )}
          </button>
        ) : (
          <button className="msb-illust-btn" onClick={illustrateAll}>
            <Palette className="h-5 w-5" /> 把照片變成繪本插畫
          </button>
        )}
        <button
          className={"msb-illust-btn" + (chatOpen ? " msb-chat-btn-on" : "")}
          onClick={() => (chatOpen ? setChatOpen(false) : openChat())}
        >
          <MessageCircleMore className="h-5 w-5" /> {chatOpen ? "收起聊天" : "聊聊這本書"}
        </button>
      </div>

      {/* 回憶問答：AI 引導長輩聊這一頁的回憶 */}
      {chatOpen && (
        <div className="msb-chat card">
          <div className="msb-chat-list">
            {chatMsgs.map((m, i) =>
              m.role === "assistant" ? (
                <div key={i} className="msb-chat-row">
                  <div className="msb-bubble msb-bubble-ai">{m.content}</div>
                  <button
                    className="msb-chat-speak"
                    onClick={() => chatSpeak(i, m.content)}
                    aria-label="唸這句話"
                  >
                    {chatSpeakingIdx === i ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              ) : (
                <div key={i} className="msb-chat-row msb-chat-row-user">
                  <div className="msb-bubble msb-bubble-user">{m.content}</div>
                </div>
              )
            )}
            {chatLoading && (
              <div className="msb-chat-row">
                <div className="msb-bubble msb-bubble-ai" role="status" aria-live="polite">
                  <span className="typing-dots" aria-hidden="true">
                    <i /><i /><i />
                  </span>
                  想一想…
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="msb-chat-inputrow">
            <input
              className="msb-chat-input"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) sendChat();
              }}
              placeholder="想到什麼都可以說說看…"
            />
            <button
              className="msb-chat-send"
              onClick={sendChat}
              disabled={chatLoading || !chatInput.trim()}
              aria-label="送出"
            >
              送出
            </button>
          </div>
        </div>
      )}

      {/* 翻頁導覽 */}
      <div className="msb-nav card">
        <button onClick={() => setPage(cur - 1)} disabled={cur === 0}>
          <ChevronLeft className="h-5 w-5" /> 上一頁
        </button>
        <span className="msb-counter">
          {cur + 1} / {total}
        </span>
        <button onClick={() => setPage(cur + 1)} disabled={cur === total - 1}>
          下一頁 <ChevronRight className="h-5 w-5" />
        </button>
      </div>
      <p className="text-sm text-[var(--color-text-muted)]">
        故事由 AI 依你的照片生成 · 可用鍵盤 ← → 翻頁
      </p>
    </div>
  );
}

/* ---------- 樣式（沿用網站色彩變數，僅補書本專屬排版）---------- */
const MSB_CSS = `
.msb-pulse { animation: msb-pulse 1.4s ease-in-out infinite; }
@keyframes msb-pulse {
  0%, 100% { transform: scale(1); opacity: .6; }
  50% { transform: scale(1.12); opacity: 1; }
}
.msb-spin { animation: msb-spin 1s linear infinite; }
@keyframes msb-spin { to { transform: rotate(360deg); } }

.msb-book {
  position: relative;
  width: 100%;
  overflow: hidden;          /* 只為了圓角，內容用自然高度不會被裁 */
  padding: 0;
  border-radius: 18px;
  animation: msb-fade .35s ease;
  font-family: "Noto Serif TC","Songti TC","PingFang TC","Microsoft JhengHei",serif;
}
@keyframes msb-fade {
  from { opacity: .3; transform: translateX(10px); }
  to { opacity: 1; transform: translateX(0); }
}

/* 封面：固定 16:9，圖滿版 + 下方壓字 */
.msb-cover { position:relative; width:100%; aspect-ratio:16/9; }
.msb-cover-img { display:block; width:100%; height:100%; object-fit:cover; }
.msb-cover-text {
  position:absolute; inset:0; padding:7% 8%;
  display:flex; flex-direction:column; justify-content:flex-end;
  background:linear-gradient(0deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,.15) 45%, rgba(0,0,0,0) 75%);
  color:#fff;
}
.msb-cover-text h1 { font-size:clamp(34px,5.5vw,64px); margin:0 0 12px; font-weight:600; letter-spacing:.08em; }
.msb-cover-text p { font-size:clamp(18px,2.2vw,26px); margin:0; opacity:.95; }

/* 故事頁：電腦=左圖右字；高度隨文字自動撐開，文字絕不被裁 */
.msb-story { display:grid; grid-template-columns:45% 55%; align-items:stretch; }
.msb-story-text {
  padding:5% 7%; display:flex; flex-direction:column; justify-content:center;
  background: var(--color-bg-card);
}
.msb-story-img { display:block; width:100%; height:100%; min-height:340px; object-fit:cover; }
.msb-story-text h2 {
  font-size:clamp(22px,2.6vw,32px); font-weight:500; margin:0 0 18px;
  letter-spacing:.06em; color: var(--color-text-primary);
}
.msb-story-text p, .msb-end p {
  font-size:clamp(17px,1.6vw,21px); line-height:1.95; letter-spacing:.02em;
  margin:0; color: var(--color-text-primary);
}

/* 朗讀鈕 */
.msb-read {
  margin-top:30px; align-self:flex-start;
  display:inline-flex; align-items:center; gap:10px;
  border:none; border-radius:999px; cursor:pointer;
  background: var(--color-accent-strong); color:#fff;
  font-size:clamp(18px,1.9vw,24px); padding:14px 26px;
  box-shadow:0 6px 16px rgba(var(--color-shadow), .18);
}
.msb-read:hover { transform:translateY(-1px); }

/* 迷你播放器：接手「念給我聽」的位置原地展開 */
.msb-player {
  margin-top:30px; align-self:stretch; max-width:560px;
  display:flex; align-items:center; gap:10px; flex-wrap:wrap;
  border:1px solid var(--color-accent-border); border-radius:999px;
  background: var(--color-accent-soft); padding:10px 16px;
}
.msb-player-btn {
  flex:0 0 auto; display:inline-flex; align-items:center; justify-content:center;
  width:46px; height:46px; border:none; border-radius:50%; cursor:pointer;
  background: var(--color-accent-strong); color:#fff;
}
.msb-player-bar {
  flex:1 1 120px; min-width:100px; height:6px; cursor:pointer;
  accent-color: var(--color-accent-strong);
}
.msb-player-bar:disabled { cursor:default; opacity:.5; }
.msb-player-time {
  flex:0 0 auto; font-size:15px; color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}
.msb-player-rate, .msb-player-auto {
  flex:0 0 auto; cursor:pointer;
  border:1px solid var(--color-accent-border); border-radius:999px;
  background: var(--color-bg-card); color: var(--color-accent-text);
  font-size:15px; font-weight:600; padding:8px 14px;
}
.msb-player-auto.on {
  background: var(--color-accent-strong); color:#fff;
  border-color: var(--color-accent-strong);
}

/* 結尾：自然高度 */
.msb-end {
  display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:20px; text-align:center;
  padding:8%; min-height:360px; background: var(--color-bg-card);
}
.msb-end h2 { font-size:clamp(28px,3.4vw,46px); font-weight:500; margin:0; color:var(--color-text-primary); }
.msb-end p { max-width:760px; }
.msb-end .msb-read { align-self:center; }
.msb-end .msb-player { align-self:center; width:100%; }

/* 導覽 */
.msb-nav {
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  width:100%; padding:10px 16px; border-radius:999px;
}
.msb-nav button {
  display:inline-flex; align-items:center; gap:6px;
  border:1px solid var(--color-border); background: var(--color-bg-card);
  color: var(--color-text-primary); border-radius:999px;
  padding:14px 22px; font-size:clamp(17px,1.7vw,21px); cursor:pointer;
}
.msb-nav button:disabled { opacity:.4; cursor:default; }
.msb-counter { color: var(--color-text-secondary); min-width:80px; text-align:center; font-size:19px; }

/* 繪本插畫切換 */
.msb-illust { display:flex; justify-content:center; }
.msb-illust-btn {
  display:inline-flex; align-items:center; gap:8px; cursor:pointer;
  border:1px solid var(--color-accent-border); border-radius:999px;
  background: var(--color-accent-soft); color: var(--color-accent-text);
  font-size:clamp(15px,1.5vw,18px); font-weight:600; padding:11px 22px;
}
.msb-illust-btn:hover { transform:translateY(-1px); }
.msb-illust-status {
  display:inline-flex; align-items:center; gap:8px;
  color: var(--color-text-secondary); font-size:clamp(15px,1.5vw,18px);
  padding:11px 22px;
}

/* 回憶問答 */
.msb-chat-btn-on { background: var(--color-accent-strong); color:#fff; border-color: var(--color-accent-strong); }
.msb-chat {
  width:100%; padding:18px; border-radius:18px;
  display:flex; flex-direction:column; gap:14px;
  animation: msb-fade .3s ease;
}
.msb-chat-list {
  display:flex; flex-direction:column; gap:10px;
  max-height:320px; overflow-y:auto; padding:2px;
}
.msb-chat-row { display:flex; align-items:flex-end; gap:8px; }
.msb-chat-row-user { justify-content:flex-end; }
.msb-bubble {
  max-width:78%; padding:12px 16px; border-radius:16px;
  font-size:clamp(16px,1.6vw,19px); line-height:1.8; letter-spacing:.02em;
}
.msb-bubble-ai {
  background: var(--color-accent-soft); color: var(--color-text-primary);
  border-bottom-left-radius:4px;
  display:inline-flex; align-items:center; gap:8px;
}
.msb-bubble-user {
  background: var(--color-accent-strong); color:#fff;
  border-bottom-right-radius:4px;
}
.msb-chat-speak {
  flex:0 0 auto; display:inline-flex; align-items:center; justify-content:center;
  width:34px; height:34px; border-radius:50%; cursor:pointer;
  border:1px solid var(--color-accent-border);
  background: var(--color-bg-card); color: var(--color-accent-text);
}
.msb-chat-inputrow { display:flex; gap:10px; }
.msb-chat-input {
  flex:1; border:1px solid var(--color-border); border-radius:999px;
  background: var(--color-bg-card); color: var(--color-text-primary);
  font-size:clamp(16px,1.6vw,19px); padding:12px 20px; outline:none;
}
.msb-chat-input:focus { border-color: var(--color-accent-strong); }
.msb-chat-send {
  flex:0 0 auto; border:none; border-radius:999px; cursor:pointer;
  background: var(--color-accent-strong); color:#fff;
  font-size:clamp(15px,1.5vw,18px); font-weight:600; padding:12px 22px;
}
.msb-chat-send:disabled { opacity:.4; cursor:default; }

/* 手機：直式（照片在上、故事在下），高度自然撐開不裁切 */
@media (max-width: 760px) {
  .msb-cover { aspect-ratio: 3 / 4; }
  .msb-story { grid-template-columns:1fr; }
  .msb-story-img { order:1; min-height:0; aspect-ratio:4/3; }
  .msb-story-text { order:2; padding:7%; justify-content:flex-start; }
  .msb-story-text h2 { margin-bottom:14px; }
  .msb-story-text p, .msb-end p { font-size:18px; line-height:1.95; }
  .msb-cover-text h1 { font-size:34px; }
  .msb-read { margin-top:18px; font-size:19px; }
  .msb-player { margin-top:18px; padding:8px 12px; gap:8px; }
  .msb-player-time { font-size:13px; }
}
`;
