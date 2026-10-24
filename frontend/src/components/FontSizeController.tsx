import { useEffect, useState } from "react";

type Props = {
  variant?: "floating" | "inline";
  className?: string;
};

export default function FontSizeController({
  variant = "floating",
  className = "",
}: Props) {
  const [fontSize, setFontSize] = useState(16);

  // 初始化讀取 localStorage

  useEffect(() => {
    const saved = localStorage.getItem("fontSize");
    if (saved) setFontSize(Number(saved));
  }, []);

  // 更新 CSS root + localStorage

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--font-size-base",
      `${fontSize}px`
    );
    localStorage.setItem("fontSize", String(fontSize));
    window.dispatchEvent(
      new CustomEvent("font-size-change", { detail: fontSize })
    );
  }, [fontSize]);

  const increase = () => setFontSize((prev) => Math.min(prev + 2, 28));

  const decrease = () => setFontSize((prev) => Math.max(prev - 2, 12));

  const isFloating = variant === "floating";
  const baseContainerClass = isFloating
    ? "theme-control-shell fixed bottom-6 left-6 z-[999] flex flex-col gap-2 rounded-lg p-3 shadow-lg backdrop-blur-md"
    : "flex items-center gap-2 text-xs sm:text-sm";

  const containerClass = className
    ? `${baseContainerClass} ${className}`
    : baseContainerClass;

  const buttonClass = isFloating
    ? "theme-button-primary rounded px-3 py-1 font-semibold"
    : "theme-control-button px-2 py-1 text-xs transition sm:text-sm";

  return (
    <div className={containerClass}>
      <button
        onClick={increase}
        className={buttonClass}
        aria-label="放大字體"
        type="button"
      >
        A+
      </button>
      <button
        onClick={decrease}
        className={buttonClass}
        aria-label="縮小字體"
        type="button"
      >
        A-
      </button>
    </div>
  );
}
