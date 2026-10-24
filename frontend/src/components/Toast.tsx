import { useEffect, useRef } from "react";

type Props = {
  message: string;
  onDone: () => void; // 顯示結束(自動消失或被點掉)時呼叫,由父層清空訊息
  durationMs?: number;
  variant?: "success" | "error"; // 成功=淡藍 ✓;錯誤=淡紅 ✕,且停留久一點
};

// 右下角浮出的輕量提示,取代會卡住整頁的瀏覽器 alert()
export default function Toast({
  message,
  onDone,
  variant = "success",
  durationMs = variant === "error" ? 4000 : 2400,
}: Props) {
  // onDone 走 ref:父層每次 render 傳新函式時,不會把計時器重置
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => {
    const timer = window.setTimeout(() => onDoneRef.current(), durationMs);
    return () => window.clearTimeout(timer);
  }, [message, durationMs]);

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onDone}
      className={`toast-enter toast-${variant} fixed bottom-6 right-6 z-[100] flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg`}
    >
      <span aria-hidden="true">{variant === "error" ? "✕" : "✓"}</span>
      <span>{message}</span>
    </div>
  );
}
