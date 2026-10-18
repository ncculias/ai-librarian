import { useEffect, useRef, useState } from "react";
import { BookOpen, MessageCircleMore } from "lucide-react";
import Popover from "./Popover";

export type ChatModeOption = { id: string; label: string; description: string };

/** 聊天模式列收合後,顯示在標題列的圖示鈕:hover 看說明,點擊切換模式或展開模式列。 */
export default function ChatModeMenu({
  modes,
  value,
  onChange,
  onExpand,
  autoFocus = false,
}: {
  modes: readonly ChatModeOption[];
  value: string;
  onChange: (id: string) => void;
  onExpand: () => void;
  /** 掛載時把焦點移到圖示鈕(收合模式列後,避免焦點掉回 body) */
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (autoFocus) triggerRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  const current = modes.find((m) => m.id === value) ?? modes[0];
  // 只有一般問答用對話圖示,其餘模式都用書本圖示
  const Icon = current.id === "general" ? MessageCircleMore : BookOpen;

  return (
    <div className="relative">
      {/* 選單展開時停用 hover 說明(disabled),避免觸控裝置上說明浮層蓋住切換選單 */}
      <Popover
        disabled={open}
        content={
          <div>
            <p className="mb-1 font-semibold text-[var(--color-text-primary)]">
              目前模式：{current.label}
            </p>
            <p>{current.description}</p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">點一下可切換或展開</p>
          </div>
        }
      >
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="theme-icon-button flex items-center rounded-lg p-2"
          aria-label={`模式：${current.label}`}
          aria-expanded={open}
        >
          <Icon className="h-5 w-5" />
          <span className="ui-sub ml-1 hidden sm:inline">{current.label}</span>
        </button>
      </Popover>
      {open && (
        <>
          {/* 點選單外任何地方收起選單 */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="theme-modal absolute right-0 top-full z-20 mt-2 w-56 rounded-xl p-2 max-sm:left-1/2 max-sm:right-auto max-sm:-translate-x-1/2">
            {modes.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-current={m.id === current.id ? "true" : undefined}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                className={`w-full rounded-lg px-3 py-2 text-left hover:bg-[var(--color-accent-soft)] ${
                  m.id === current.id
                    ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-text)]"
                    : ""
                }`}
              >
                {m.label}
                <span className="mt-0.5 block text-xs text-[var(--color-text-muted)]">
                  {m.description}
                </span>
              </button>
            ))}
            <div className="my-1 border-t border-[var(--color-border)]" />
            <button
              type="button"
              onClick={() => {
                onExpand();
                setOpen(false);
              }}
              className="w-full rounded-lg px-3 py-2 text-left hover:bg-[var(--color-accent-soft)]"
            >
              展開模式列
            </button>
          </div>
        </>
      )}
    </div>
  );
}
