import { Moon, Sun } from "lucide-react";
import { useTheme } from "../theme";

type Props = {
  className?: string;
};

export default function ThemeToggle({ className = "" }: Props) {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === "light";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`theme-toggle text-base ${className}`.trim()}
      aria-label={isLight ? "切換為深色模式" : "切換為淺色模式"}
      aria-pressed={!isLight}
    >
      {isLight ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span>{isLight ? "淺色" : "深色"}</span>
    </button>
  );
}
