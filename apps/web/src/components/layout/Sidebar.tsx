import { NavLink } from "react-router-dom";
import { Activity, Boxes, LayoutGrid, Moon, PanelLeftClose, PanelLeftOpen, Sun, Tags } from "lucide-react";
import { useEffect, useState } from "react";
import { useHealth } from "@/hooks/useSystem";
import { cn } from "@/lib/cn";
import { Tip } from "@/components/ui/Misc";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutGrid, end: true },
  { to: "/products", label: "Products", icon: Boxes, end: false },
  { to: "/attribute-sets", label: "Attribute sets", icon: Tags, end: false },
  { to: "/logs", label: "Sync log", icon: Activity, end: false },
];

const readTheme = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

export const Sidebar = ({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) => {
  const health = useHealth();
  const [theme, setTheme] = useState(readTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("pim-theme", theme);
    } catch {
      /* storage blocked: theme still applies for this session */
    }
  }, [theme]);

  const woo = health.data?.woo;
  const state = health.isError ? "offline" : woo?.state;
  const dot = state === "connected" ? "bg-ok" : state === undefined ? "bg-faint animate-pulse-dot" : state === "offline" ? "bg-bad" : "bg-warn";
  const stateLabel =
    state === "connected" ? "Connected" : state === undefined ? "Checking…" : state === "offline" ? "PIM server offline" : state === "unauthorized" ? "Invalid API keys" : state === "misconfigured" ? "Check store settings" : "Store unreachable";
  const storeLabel = woo ? (woo.mode === "mock" ? "Mock store" : woo.storeUrl.replace(/^https?:\/\//, "")) : "WooCommerce";

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-border bg-bg transition-[width] duration-150",
        collapsed ? "w-[56px]" : "w-[240px]",
      )}
    >
      <div className={cn("flex h-14 items-center border-b border-border", collapsed ? "justify-center" : "justify-between px-4")}>
        {!collapsed && (
          <div className="flex items-center gap-2">
            <Mark />
            <span className="text-sm font-semibold tracking-tight">Catalyst</span>
            <span className="rounded border border-border px-1 font-mono text-2xs text-muted">PIM</span>
          </div>
        )}
        <button
          onClick={onToggle}
          className="rounded p-1 text-muted hover:bg-subtle hover:text-fg"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 p-2" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex h-8 items-center gap-2.5 rounded px-2.5 text-sm transition-colors",
                collapsed && "justify-center px-0",
                isActive ? "bg-surface font-medium text-fg shadow-[inset_0_0_0_1px_rgb(var(--border))]" : "text-muted hover:bg-subtle hover:text-fg",
              )
            }
            title={collapsed ? label : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            {!collapsed && label}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-1 border-t border-border p-2">
        <button
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          className={cn("flex h-8 w-full items-center gap-2.5 rounded px-2.5 text-sm text-muted hover:bg-subtle hover:text-fg", collapsed && "justify-center px-0")}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" strokeWidth={1.75} /> : <Moon className="h-4 w-4" strokeWidth={1.75} />}
          {!collapsed && (theme === "dark" ? "Light mode" : "Dark mode")}
        </button>
        <Tip label={woo?.message ?? stateLabel} side="top">
          <div
            className={cn("flex w-full items-center gap-2.5 rounded px-2.5 py-2", collapsed && "justify-center px-0")}
            aria-live="polite"
          >
            <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} />
            {!collapsed && (
              <div className="min-w-0 leading-tight">
                <p className="truncate text-xs font-medium">{storeLabel}</p>
                <p className="truncate text-2xs text-muted">{stateLabel}</p>
              </div>
            )}
          </div>
        </Tip>
      </div>
    </aside>
  );
};

const Mark = () => (
  <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden>
    <rect width="20" height="20" rx="5" className="fill-accent" />
    <path d="M6 7h8M6 10h5M6 13h8" className="stroke-accent-fg" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
