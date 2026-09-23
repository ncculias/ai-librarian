import { Link, NavLink } from "react-router-dom";
import { BookImage, BookOpen, MessageCircleMore } from "lucide-react";
import FontSizeController from "./FontSizeController";
import ThemeToggle from "./ThemeToggle";

const navItems = [
  {
    to: "/librarian",
    label: "聊天問答",
    icon: MessageCircleMore,
  },
  {
    to: "/my-story-book",
    label: "繪本生成",
    icon: BookImage,
  },
];

export default function Navbar() {
  return (
    <nav className="theme-nav sticky top-0 z-50">
      <div className="mx-auto flex min-h-20 max-w-7xl flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center justify-between gap-4">
          <Link
            to="/"
            className="flex items-center gap-3 transition hover:opacity-80"
          >
            <BookOpen className="h-7 w-7 text-[var(--color-accent-strong)]" />
            <div>
              <div className="text-base font-bold text-[var(--color-text-primary)]">
                AI Librarian
              </div>
              <div className="text-xs text-[var(--color-text-secondary)]">
                智慧搜尋幫手
              </div>
            </div>
          </Link>

          <div className="hidden flex-wrap gap-2 lg:flex">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ${
                    isActive
                      ? "theme-button-accent theme-button-accent-active"
                      : "theme-button-secondary"
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex w-full flex-wrap gap-2 lg:hidden">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ${
                    isActive
                      ? "theme-button-accent theme-button-accent-active"
                      : "theme-button-secondary"
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </div>

          <ThemeToggle className="motion-button" />
          <span className="text-xs text-[var(--color-text-secondary)] sm:text-sm">
            字體大小
          </span>
          <FontSizeController
            variant="inline"
            className="theme-control-shell rounded-full px-3 py-1"
          />
        </div>
      </div>
    </nav>
  );
}
