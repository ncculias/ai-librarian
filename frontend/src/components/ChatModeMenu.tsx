import { useState } from "react";
import { BookOpen, MessageCircleMore } from "lucide-react";
import Popover from "./Popover";

export type ChatModeOption = { id: string; label: string; description: string };

/** 聊天模式列收合後,顯示在標題列的圖示鈕:hover 看說明,點擊切換模式或展開模式列。 */
export default function ChatModeMenu({
  modes,
  value,
  onChange,
  onExpand,
}: {
  modes: readonly ChatModeOption[];
  value: string;
  onChange: (id: string) => void;
  onExpand: () => void;
}) {
  const [open, setOpen] = useState(false);
  const current = modes.find((m) => m.id === value) ?? modes[0];
  // 只有一般問答用對話圖示,其餘模式都用書本圖示
  const Icon = current.id === "general" ? MessageCircleMore : BookOpen;

  return (
    <div className="relative">
      {/* Popover 只包圖示鈕,避免說明浮層蓋住下方的切換選單 */}
      <Popover
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
          <div className="theme-modal absolute right-0 top-full z-20 mt-2 w-56 rounded-xl p-2">
            {modes.map((m) => (
              <button
                key={m.id}
                type="button"
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
