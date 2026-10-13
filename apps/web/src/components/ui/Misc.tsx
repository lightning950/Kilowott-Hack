import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const Kbd = ({ children, className }: { children: ReactNode; className?: string }) => (
  <kbd
    className={cn(
      "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-border bg-subtle px-1 font-mono text-2xs text-muted",
      className,
    )}
  >
    {children}
  </kbd>
);

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("animate-pulse rounded bg-subtle", className)} aria-hidden />
);

export const EmptyState = ({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) => (
  <div className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
    {icon && <div className="mb-3 text-faint">{icon}</div>}
    <p className="text-sm font-medium text-fg">{title}</p>
    {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const Panel = ({ title, aside, children, className, bodyClassName }: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) => (
  <section className={cn("rounded-lg border border-border bg-surface", className)}>
    {(title || aside) && (
      <header className="flex h-11 items-center justify-between gap-3 border-b border-border px-4">
        <h2 className="text-sm font-medium">{title}</h2>
        {aside}
      </header>
    )}
    <div className={cn("p-4", bodyClassName)}>{children}</div>
  </section>
);

/** Native-title tooltip with a styled hover card; good enough without a positioning library. */
export const Tip = ({ label, children, side = "top" }: { label: string; children: ReactNode; side?: "top" | "bottom" }) => (
  <span className="group/tip relative inline-flex">
    {children}
    {label && (
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded border border-border bg-fg px-2 py-1 text-2xs text-bg opacity-0 shadow-overlay transition-opacity delay-300 group-hover/tip:opacity-100",
          side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
        )}
      >
        {label}
      </span>
    )}
  </span>
);

export const ErrorBanner = ({ title, message, action }: { title: string; message: string; action?: ReactNode }) => (
  <div role="alert" className="flex items-start justify-between gap-4 rounded-lg border border-bad/25 bg-bad-tint px-4 py-3">
    <div>
      <p className="text-sm font-medium text-bad">{title}</p>
      <p className="mt-0.5 text-sm text-fg/80">{message}</p>
    </div>
    {action}
  </div>
);
