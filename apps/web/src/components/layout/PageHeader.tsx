import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Search } from "lucide-react";
import { Kbd } from "@/components/ui/Misc";
import { usePalette } from "./paletteContext";

interface Crumb {
  label: string;
  to?: string;
}

/** Sticky top bar every page renders: breadcrumb, ⌘K trigger, page actions. */
export const PageHeader = ({ crumbs, actions }: { crumbs: Crumb[]; actions?: ReactNode }) => {
  const palette = usePalette();
  const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-bg/85 px-6 backdrop-blur">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((c, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-faint" />}
            {c.to ? (
              <Link to={c.to} className="truncate text-muted hover:text-fg">
                {c.label}
              </Link>
            ) : (
              <span className="truncate font-medium text-fg">{c.label}</span>
            )}
          </span>
        ))}
      </nav>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={palette.open}
          className="hidden h-8 w-56 items-center gap-2 rounded border border-border bg-surface px-2.5 text-sm text-faint transition-colors hover:border-border-strong md:flex"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">Search or jump to…</span>
          <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
          <Kbd>K</Kbd>
        </button>
        {actions}
      </div>
    </header>
  );
};
