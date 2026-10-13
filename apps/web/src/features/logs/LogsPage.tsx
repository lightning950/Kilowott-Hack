import { LOG_STATUSES, SYNC_ACTIONS, type LogStatus, type SyncAction, type SyncLog } from "@pim/shared";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Activity, AlertTriangle, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { EmptyState, ErrorBanner, Skeleton, Tip } from "@/components/ui/Misc";
import { useLogs } from "@/hooks/useSystem";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { exactTime, relativeTime } from "@/lib/format";

const PAGE_SIZE = 30;

export const LogsPage = () => {
  const [params, setParams] = useSearchParams();
  const status = (params.get("status") as LogStatus | null) ?? undefined;
  const action = (params.get("action") as SyncAction | null) ?? undefined;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const logs = useLogs({ status, action, page, pageSize: PAGE_SIZE });
  const [open, setOpen] = useState<number | null>(null);

  const setFilter = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    v ? n.set(k, v) : n.delete(k);
    if (k !== "page") n.delete("page");
    setParams(n, { replace: true });
  };

  const items = logs.data?.items ?? [];
  return (
    <>
      <PageHeader crumbs={[{ label: "Sync log" }]} />
      <div className="mx-auto w-full max-w-[1200px] space-y-4 p-6">
        <div className="flex items-center gap-2">
          <Select value={status ?? ""} onChange={(e) => setFilter("status", e.target.value)} className="w-36" aria-label="Filter by result">
            <option value="">All results</option>
            {LOG_STATUSES.map((s) => <option key={s} value={s}>{s === "success" ? "Succeeded" : "Failed"}</option>)}
          </Select>
          <Select value={action ?? ""} onChange={(e) => setFilter("action", e.target.value)} className="w-36" aria-label="Filter by action">
            <option value="">All actions</option>
            {SYNC_ACTIONS.map((a) => <option key={a} value={a}>{a[0]!.toUpperCase() + a.slice(1)}</option>)}
          </Select>
        </div>

        {logs.isError && <ErrorBanner title="Couldn't load the sync log" message={errorMessage(logs.error)} action={<Button size="sm" onClick={() => logs.refetch()}>Retry</Button>} />}

        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {logs.isLoading ? (
            <div className="space-y-3 p-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-7 w-full" />)}</div>
          ) : items.length === 0 ? (
            <EmptyState icon={<Activity className="h-6 w-6" />} title={status || action ? "No entries match" : "No sync activity yet"} description="Every sync, import and store delete is recorded here with its result and timing." />
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["", "When", "Product", "Action", "Result", "Message", "Time"].map((h, i) => (
                    <th key={i} className={cn("h-9 px-3 text-left text-2xs font-medium uppercase tracking-wider text-muted", h === "Time" && "text-right")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((l) => <LogRow key={l.id} log={l} open={open === l.id} onToggle={() => setOpen(open === l.id ? null : l.id)} />)}
              </tbody>
            </table>
          )}
          {logs.data && logs.data.total > PAGE_SIZE && (
            <footer className="flex h-11 items-center justify-between border-t border-border px-4 text-xs text-muted">
              <span className="num">{logs.data.total} entries</span>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page <= 1} onClick={() => setFilter("page", String(page - 1))} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
                <span className="num px-1">{page} / {logs.data.totalPages}</span>
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page >= logs.data.totalPages} onClick={() => setFilter("page", String(page + 1))} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </footer>
          )}
        </div>
      </div>
    </>
  );
};

const LogRow = ({ log, open, onToggle }: { log: SyncLog; open: boolean; onToggle: () => void }) => (
  <>
    <tr onClick={onToggle} className={cn("h-10 cursor-pointer border-b border-border/70 hover:bg-subtle/60", open && "bg-subtle/60")} aria-expanded={open}>
      <td className="w-8 pl-3"><ChevronDown className={cn("h-3.5 w-3.5 text-faint transition-transform", !open && "-rotate-90")} /></td>
      <td className="whitespace-nowrap px-3 text-xs text-muted"><Tip label={exactTime(log.createdAt)}>{relativeTime(log.createdAt)}</Tip></td>
      <td className="px-3 font-mono text-xs">
        {log.productId ? <Link to={`/products/${log.productId}`} onClick={(e) => e.stopPropagation()} className="hover:underline">{log.productSku}</Link> : (log.productSku ?? <span className="text-faint">—</span>)}
      </td>
      <td className="px-3 capitalize">{log.action}</td>
      <td className="px-3">
        <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", log.status === "success" ? "text-ok" : "text-bad")}>
          <span className={cn("h-1.5 w-1.5 rounded-full", log.status === "success" ? "bg-ok" : "bg-bad")} />
          {log.status === "success" ? "Success" : "Failed"}
          {log.warnings.length > 0 && <span className="rounded bg-warn-tint px-1 text-2xs text-warn">{log.warnings.length} warning{log.warnings.length > 1 && "s"}</span>}
        </span>
      </td>
      <td className="max-w-[360px] truncate px-3 text-muted">{log.message}</td>
      <td className="num whitespace-nowrap px-3 text-right text-xs text-muted">{log.durationMs} ms</td>
    </tr>
    {open && (
      <tr className="border-b border-border/70 bg-subtle/40">
        <td />
        <td colSpan={6} className="px-3 py-3">
          <p className="whitespace-pre-wrap break-words text-sm">{log.message}</p>
          {log.warnings.length > 0 && (
            <ul className="mt-2 space-y-1">
              {log.warnings.map((w, i) => <li key={i} className="flex items-center gap-1.5 text-xs text-warn"><AlertTriangle className="h-3 w-3" />{w}</li>)}
            </ul>
          )}
          <p className="mt-2 font-mono text-2xs text-faint">#{log.id} · {exactTime(log.createdAt)} · {log.durationMs} ms</p>
        </td>
      </tr>
    )}
  </>
);
