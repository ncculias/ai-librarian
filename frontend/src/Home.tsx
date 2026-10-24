import HomeHero from "./components/home/HomeHero";
import HomeStage from "./components/home/HomeStage";
import HomeStory from "./components/home/HomeStory";
import HomeIndex from "./components/home/HomeIndex";
import "./components/home/home.css";
import { useTheme } from "./theme";

export default function Home() {
  const { theme } = useTheme();
  const particleClass =
    theme === "light" ? "bg-sky-300/60" : "bg-white/80";

  return (
    <div className="home-shell relative z-10">
      <div className="hs-grain" aria-hidden="true" />

      {/* 漂浮小點 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {Array.from({ length: 40 }).map((_, i) => (
          <span
            key={i}
            className={`absolute h-1.5 w-1.5 rounded-full opacity-70 animate-float ${particleClass}`}
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              animationDuration: `${5 + Math.random() * 10}s`,
              animationDelay: `${Math.random() * 5}s`,
            }}
          />
        ))}
      </div>

      <HomeHero />
      <HomeStage />
      <HomeStory />
      <HomeIndex />
    </div>
  );
}
