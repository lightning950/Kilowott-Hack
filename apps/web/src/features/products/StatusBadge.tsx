import type { SyncStatus } from "@pim/shared";
import { cn } from "@/lib/cn";

export const STATUS_META: Record<SyncStatus, { label: string; dot: string; pill: string }> = {
  synced: { label: "Synced", dot: "bg-ok", pill: "text-ok bg-ok-tint border-ok/20" },
  out_of_sync: { label: "Out of sync", dot: "bg-warn", pill: "text-warn bg-warn-tint border-warn/20" },
  failed: { label: "Failed", dot: "bg-bad", pill: "text-bad bg-bad-tint border-bad/20" },
  draft: { label: "Draft", dot: "bg-faint", pill: "text-muted bg-subtle border-border" },
  syncing: { label: "Syncing", dot: "bg-info animate-pulse-dot", pill: "text-info bg-info-tint border-info/20" },
};

export const StatusBadge = ({ status, className }: { status: SyncStatus; className?: string }) => {
  const m = STATUS_META[status];
  return (
    <span
      className={cn("inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 text-2xs font-medium", m.pill, className)}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} aria-hidden />
      {m.label}
    </span>
  );
};

export const StatusDot = ({ status }: { status: SyncStatus }) => (
  <span className={cn("inline-block h-2 w-2 rounded-full", STATUS_META[status].dot)} aria-label={STATUS_META[status].label} />
);
