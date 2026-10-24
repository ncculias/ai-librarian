import { useMemo } from "react";
import HomeHero from "./components/home/HomeHero";
import HomeStage from "./components/home/HomeStage";
import HomeStory from "./components/home/HomeStory";
import "./components/home/home.css";
import { useTheme } from "./theme";

export default function Home() {
  const { theme } = useTheme();
  const particleClass =
    theme === "light" ? "bg-sky-300/60" : "bg-white/80";

  // 漂浮小點的位置只算一次，避免每次 render（換主題、字級）都重新亂數而跳動
  const particles = useMemo(
    () =>
      Array.from({ length: 40 }, () => ({
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        animationDuration: `${5 + Math.random() * 10}s`,
        animationDelay: `${Math.random() * 5}s`,
      })),
    [],
  );

  return (
    <div className="home-shell relative z-10">
      <div className="hs-grain" aria-hidden="true" />

      {/* 漂浮小點 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {particles.map((style, i) => (
          <span
            key={i}
            className={`absolute h-1.5 w-1.5 rounded-full opacity-70 animate-float motion-reduce:animate-none ${particleClass}`}
            style={style}
          />
        ))}
      </div>

      <HomeHero />
      <HomeStage />
      <HomeStory />
    </div>
  );
}
