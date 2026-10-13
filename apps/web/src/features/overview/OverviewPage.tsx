import type { SyncLog } from "@pim/shared";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Plus, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorBanner, Panel, Skeleton, Tip } from "@/components/ui/Misc";
import { useProducts } from "@/hooks/useProducts";
import { useBulkSync, useSyncProduct } from "@/hooks/useSync";
import { useHealth, useLogs, useStats } from "@/hooks/useSystem";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { exactTime, relativeTime } from "@/lib/format";
import { StatusBadge } from "@/features/products/StatusBadge";

export const OverviewPage = () => {
  const stats = useStats();
  const health = useHealth();
  const failed = useProducts({ status: "failed", pageSize: 6 });
  const outOfSync = useProducts({ status: "out_of_sync", pageSize: 6 });
  const drafts = useProducts({ status: "draft", pageSize: 6 });
  const logs = useLogs({ pageSize: 8 });
  const bulk = useBulkSync();

  const s = stats.data;
  const attention = [...(failed.data?.items ?? []), ...(outOfSync.data?.items ?? []), ...(drafts.data?.items ?? [])].slice(0, 8);
  const attentionTotal = (failed.data?.total ?? 0) + (outOfSync.data?.total ?? 0) + (drafts.data?.total ?? 0);
  const attentionLoading = failed.isLoading || outOfSync.isLoading || drafts.isLoading;

  const cells: { label: string; value: number | undefined; tone?: string; to: string }[] = [
    { label: "Products", value: s?.total, to: "/products" },
    { label: "Synced", value: s?.byStatus.synced, tone: "bg-ok", to: "/products?status=synced" },
    { label: "Out of sync", value: s?.byStatus.out_of_sync, tone: "bg-warn", to: "/products?status=out_of_sync" },
    { label: "Failed", value: s?.byStatus.failed, tone: "bg-bad", to: "/products?status=failed" },
    { label: "Draft", value: s?.byStatus.draft, tone: "bg-faint", to: "/products?status=draft" },
    { label: "Variations", value: s?.variations, to: "/products?type=variable" },
  ];

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Overview" }]}
        actions={
          <Button
            variant="primary"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            loading={bulk.isPending}
            disabled={!s?.pending}
            onClick={() => bulk.mutate(undefined)}
          >
            Sync {s?.pending ? `${s.pending} pending` : "pending"}
          </Button>
        }
      />
      <div className="mx-auto w-full max-w-[1200px] space-y-6 p-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Catalog health</h1>
          <p className="mt-1 text-sm text-muted">
            {health.data?.woo.state === "connected"
              ? `Connected to ${health.data.woo.mode === "mock" ? "the mock store" : health.data.woo.storeUrl}. `
              : health.data
                ? `${health.data.woo.message}. `
                : ""}
            {s?.lastSyncAt ? (
              <>Last successful sync <span title={exactTime(s.lastSyncAt)} className="text-fg">{relativeTime(s.lastSyncAt)}</span>.</>
            ) : (
              "Nothing synced yet."
            )}
          </p>
        </div>

        {stats.isError && <ErrorBanner title="Couldn't load stats" message={errorMessage(stats.error)} action={<Button size="sm" onClick={() => stats.refetch()}>Retry</Button>} />}

        <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-surface sm:grid-cols-3 lg:grid-cols-6">
          {cells.map((c, i) => (
            <Link
              key={c.label}
              to={c.to}
              className={cn("group px-4 py-3.5 transition-colors hover:bg-subtle/60", i > 0 && "border-l border-border", "max-lg:[&:nth-child(4)]:border-l-0 max-lg:[&:nth-child(n+4)]:border-t max-sm:[&:nth-child(odd)]:border-l-0 max-sm:[&:nth-child(n+3)]:border-t")}
            >
              <p className="flex items-center gap-1.5 text-xs text-muted">
                {c.tone && <span className={cn("h-1.5 w-1.5 rounded-full", c.tone)} />}
                {c.label}
              </p>
              {c.value === undefined ? <Skeleton className="mt-2 h-6 w-10" /> : <p className="num mt-1 text-xl font-semibold tracking-tight">{c.value}</p>}
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Panel
            title={<span className="flex items-center gap-2">Needs attention {attentionTotal > 0 && <span className="num rounded bg-subtle px-1.5 text-2xs text-muted">{attentionTotal}</span>}</span>}
            aside={attentionTotal > attention.length ? <Link to="/products" className="text-xs text-muted hover:text-fg">View all</Link> : null}
            bodyClassName="p-0"
          >
            {attentionLoading ? (
              <div className="space-y-3 p-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : attention.length === 0 ? (
              s?.total === 0 ? (
                <EmptyState
                  title="Your catalog is empty"
                  description="Create a product or import from your store to get started."
                  action={<Link to="/products/new"><Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />}>New product</Button></Link>}
                />
              ) : attentionTotal === 0 && (s?.pending ?? 0) === 0 ? (
                <EmptyState icon={<CheckCircle2 className="h-6 w-6 text-ok" />} title="Everything is in sync" description="No failed or outdated products right now." />
              ) : null
            ) : (
              <ul className="divide-y divide-border">
                {attention.map((p) => (
                  <AttentionRow key={p.id} id={p.id} name={p.name} sku={p.sku} status={p.syncStatus} error={p.lastError} updatedAt={p.updatedAt} />
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Recent activity" aside={<Link to="/logs" className="flex items-center gap-1 text-xs text-muted hover:text-fg">Sync log <ArrowRight className="h-3 w-3" /></Link>} bodyClassName="p-0">
            {logs.isLoading ? (
              <div className="space-y-3 p-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
            ) : !logs.data?.items.length ? (
              <EmptyState title="No activity yet" description="Syncs, imports and deletes show up here." />
            ) : (
              <ol className="relative px-4 py-3">
                {logs.data.items.map((l) => <ActivityItem key={l.id} log={l} />)}
              </ol>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
};

const AttentionRow = ({ id, name, sku, status, error, updatedAt }: { id: number; name: string; sku: string; status: "failed" | "out_of_sync" | "draft" | "synced" | "syncing"; error: string | null; updatedAt: string }) => {
  const sync = useSyncProduct();
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link to={`/products/${id}`} className="truncate text-sm font-medium hover:underline">{name}</Link>
          <span className="font-mono text-2xs text-faint">{sku}</span>
        </div>
        <p className="truncate text-xs text-muted">{status === "failed" && error ? error : status === "draft" ? "Never synced to the store" : `Edited ${relativeTime(updatedAt)}, not pushed yet`}</p>
      </div>
      <StatusBadge status={sync.isPending ? "syncing" : status} />
      <Button size="sm" loading={sync.isPending} onClick={() => sync.mutate({ id, sku })}>
        {status === "failed" ? "Retry" : "Sync"}
      </Button>
    </li>
  );
};

const ACTION_LABEL: Record<SyncLog["action"], string> = { create: "Created", update: "Updated", delete: "Deleted", import: "Imported" };

const ActivityItem = ({ log }: { log: SyncLog }) => (
  <li className="relative flex gap-3 pb-3 last:pb-0">
    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", log.status === "success" ? "bg-ok" : "bg-bad")} />
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm">
        {log.status === "failed" ? <span className="text-bad">Failed</span> : ACTION_LABEL[log.action]}{" "}
        {log.productSku ? <span className="font-mono text-xs">{log.productSku}</span> : log.action === "import" ? "catalog" : ""}
      </p>
      <p className="truncate text-xs text-muted">{log.message}</p>
    </div>
    <Tip label={exactTime(log.createdAt)}>
      <span className="shrink-0 text-2xs text-faint">{relativeTime(log.createdAt)}</span>
    </Tip>
  </li>
);
