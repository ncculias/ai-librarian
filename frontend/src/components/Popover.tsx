import { useState } from "react";

export default function Popover({
  children,
  content,
  className = "inline-block",
  disabled = false,
}: {
  children: React.ReactNode;
  content: React.ReactNode;
  className?: string;
  /** 為 true 時不顯示說明浮層(例如同一按鈕的切換選單已展開,避免觸控裝置上浮層蓋住選單) */
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`relative ${className}`}

      onMouseEnter={() => setOpen(true)}

      onMouseLeave={() => setOpen(false)}
    >
      {children}

      {open && !disabled && (
        <div
          className="theme-popover absolute right-0 top-full z-50 mt-2 w-56 rounded-lg p-3 text-sm animate-fadeIn"
        >
          {content}
        </div>
      )}
    </div>
  );
}
