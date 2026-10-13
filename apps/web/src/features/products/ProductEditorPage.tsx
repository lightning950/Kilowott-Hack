import {
  MAX_VARIATIONS,
  productCreateSchema,
  type AttributeDef,
  type ProductCreateInput,
  type ProductDetail,
  type ProductType,
} from "@pim/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, ArrowUpRight, Boxes, Loader2, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { EmptyState, Kbd, Panel, Skeleton } from "@/components/ui/Misc";
import { Dialog } from "@/components/ui/Overlay";
import { useAttributeSets } from "@/hooks/useAttributeSets";
import { useHotkey } from "@/hooks/useHotkey";
import { useCreateProduct, useGenerateVariations, useProduct, useUpdateProduct } from "@/hooks/useProducts";
import { useSyncProduct } from "@/hooks/useSync";
import { ApiError, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { exactTime, inputToPaise, paiseToInput, pluralize, relativeTime } from "@/lib/format";
import { toFieldErrors } from "@/lib/fieldErrors";
import { AttributeEditor } from "./AttributeEditor";
import { DeleteProductDialog } from "./DeleteProductDialog";
import { Thumb } from "./ProductTable";
import { StatusBadge } from "./StatusBadge";
import { VariationGrid } from "./VariationGrid";

/** Form state keeps money as the strings the user typed; converted to paise on save. */
interface FormState {
  sku: string;
  name: string;
  type: ProductType;
  category: string;
  shortDescription: string;
  description: string;
  imageUrl: string;
  regularPrice: string;
  salePrice: string;
  stockQuantity: string;
  attributeSetId: number | null;
  attributes: AttributeDef[];
}

const EMPTY: FormState = {
  sku: "",
  name: "",
  type: "simple",
  category: "",
  shortDescription: "",
  description: "",
  imageUrl: "",
  regularPrice: "",
  salePrice: "",
  stockQuantity: "0",
  attributeSetId: null,
  attributes: [],
};

const fromProduct = (p: ProductDetail): FormState => ({
  sku: p.sku,
  name: p.name,
  type: p.type,
  category: p.category,
  shortDescription: p.shortDescription,
  description: p.description,
  imageUrl: p.imageUrl ?? "",
  regularPrice: paiseToInput(p.regularPrice),
  salePrice: paiseToInput(p.salePrice),
  stockQuantity: String(p.stockQuantity),
  attributeSetId: p.attributeSetId,
  attributes: p.attributes,
});

/** Builds the API payload. Unparseable numbers become NaN so the shared schema reports them. */
const toInput = (f: FormState): ProductCreateInput => {
  const stock = f.stockQuantity.trim();
  return {
    sku: f.sku,
    name: f.name,
    type: f.type,
    category: f.category,
    shortDescription: f.shortDescription,
    description: f.description,
    imageUrl: f.imageUrl.trim() || null,
    regularPrice: inputToPaise(f.regularPrice) ?? 0,
    salePrice: f.type === "variable" ? null : inputToPaise(f.salePrice),
    stockQuantity: f.type === "variable" ? 0 : stock === "" ? 0 : /^\d+$/.test(stock) ? Number(stock) : Number.NaN,
    attributeSetId: f.attributeSetId,
    attributes: f.type === "variable" ? f.attributes.map((a) => ({ name: a.name, options: a.options })) : [],
  };
};

export const ProductEditorPage = () => {
  const params = useParams();
  const id = params.id ? Number(params.id) : null;
  const isNew = id === null;
  const navigate = useNavigate();

  const product = useProduct(id);
  const sets = useAttributeSets();
  const create = useCreateProduct();
  const update = useUpdateProduct(id ?? 0);
  const sync = useSyncProduct();
  const generate = useGenerateVariations(id ?? 0);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [baseline, setBaseline] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmSimple, setConfirmSimple] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  /** Set right before an intentional navigation (after create/delete) so the guard lets it through. */
  const skipGuard = useRef(false);

  // Load (or reload after save) the server copy into the form.
  useEffect(() => {
    if (product.data) {
      const next = fromProduct(product.data);
      setBaseline(next);
      setForm((current) => (JSON.stringify(current) === JSON.stringify(baseline) ? next : current));
    }
    // Only react to new server data, not to local edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.data]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(baseline), [form, baseline]);
  const saving = create.isPending || update.isPending;

  // Unsaved-changes guard: in-app navigation and tab close.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !skipGuard.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      if (!Object.keys(e).some((k) => k === key || k.startsWith(`${key}.`))) return e;
      return Object.fromEntries(Object.entries(e).filter(([k]) => k !== key && !k.startsWith(`${key}.`)));
    });
  };

  const save = (confirmDeleteVariations = false) => {
    const input = toInput(form);
    const check = productCreateSchema.safeParse(input);
    if (!check.success) {
      const fe = toFieldErrors(check.error);
      setErrors(fe);
      toast.error("Fix the highlighted fields", { description: Object.values(fe)[0] });
      return;
    }
    setErrors({});
    const onError = (e: unknown) => {
      if (e instanceof ApiError && e.code === "VARIATIONS_EXIST") return setConfirmSimple(e.message);
      if (e instanceof ApiError && Object.keys(e.fieldErrors).length) setErrors(e.fieldErrors);
      toast.error("Couldn't save", { description: errorMessage(e) });
    };

    if (isNew) {
      create.mutate(input, {
        onSuccess: (p) => {
          toast.success("Product created", { description: p.type === "variable" ? "Next: generate variations." : "Ready to sync." });
          skipGuard.current = true;
          navigate(`/products/${p.id}`, { replace: true });
        },
        onError,
      });
    } else {
      update.mutate(
        { body: input, confirmDeleteVariations },
        {
          onSuccess: (p) => {
            const next = fromProduct(p);
            setBaseline(next);
            setForm(next);
            setConfirmSimple(null);
            toast.success("Changes saved", { description: p.syncStatus === "out_of_sync" ? "Sync to push them to the store." : undefined });
          },
          onError,
        },
      );
    }
  };

  useEffect(() => {
    skipGuard.current = false;
  }, [id]);

  const p = product.data;
  const canSync = !!p && !dirty && p.syncStatus !== "syncing" && !sync.isPending;
  const runSync = () => p && canSync && sync.mutate({ id: p.id, sku: p.sku });

  useHotkey("mod+s", () => dirty && !saving && save());
  useHotkey("s", runSync, !!p);

  if (!isNew && product.isError) {
    const notFound = product.error instanceof ApiError && product.error.code === "NOT_FOUND";
    return (
      <>
        <PageHeader crumbs={[{ label: "Products", to: "/products" }, { label: notFound ? "Not found" : "Error" }]} />
        <EmptyState
          icon={<Boxes className="h-6 w-6" />}
          title={notFound ? "This product doesn't exist" : "Couldn't load this product"}
          description={notFound ? "It may have been deleted." : errorMessage(product.error)}
          action={<Button onClick={() => (notFound ? navigate("/products") : product.refetch())}>{notFound ? "Back to products" : "Retry"}</Button>}
        />
      </>
    );
  }

  const loading = !isNew && !p;
  const title = isNew ? "New product" : (p?.name ?? "Loading…");
  const attributeNames = p?.attributes.map((a) => a.name) ?? [];
  const combos = form.attributes.length ? form.attributes.reduce((n, a) => n * a.options.length, 1) : 0;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Products", to: "/products" }, { label: title }]}
        actions={
          <>
            {dirty && (
              <Button variant="ghost" onClick={() => { setForm(baseline); setErrors({}); }}>
                Discard
              </Button>
            )}
            <Button variant="primary" loading={saving} disabled={!dirty && !isNew} onClick={() => save()}>
              {isNew ? "Create product" : "Save changes"}
            </Button>
          </>
        }
      />

      {loading ? (
        <EditorSkeleton />
      ) : (
        <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-5">
            <Panel title="Details">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Name" error={errors.name} className="sm:col-span-2">
                  {(fid, d) => (
                    <Input id={fid} aria-describedby={d} value={form.name} error={errors.name} onChange={(e) => set("name", e.target.value)} placeholder="Organic Cotton Crew Tee" autoFocus={isNew} />
                  )}
                </Field>
                <Field label="SKU" error={errors.sku} hint="Letters, numbers and dashes. Must be unique.">
                  {(fid, d) => (
                    <Input
                      id={fid}
                      aria-describedby={d}
                      mono
                      value={form.sku}
                      error={errors.sku}
                      onChange={(e) => set("sku", e.target.value.toUpperCase().replace(/\s+/g, "-"))}
                      placeholder="TEE-CREW-ORG"
                      maxLength={40}
                    />
                  )}
                </Field>
                <Field label="Category" error={errors.category} hint="Created in WooCommerce if it doesn't exist.">
                  {(fid, d) => <Input id={fid} aria-describedby={d} value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="Apparel" />}
                </Field>
                <Field label="Product type" className="sm:col-span-2">
                  {() => (
                    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Product type">
                      {(
                        [
                          ["simple", "Simple", "One SKU, one price, one stock count."],
                          ["variable", "Variable", "Variations from attributes like size and color."],
                        ] as const
                      ).map(([value, label, desc]) => (
                        <button
                          key={value}
                          role="radio"
                          aria-checked={form.type === value}
                          onClick={() => set("type", value)}
                          className={cn(
                            "rounded-lg border px-3 py-2.5 text-left transition-colors",
                            form.type === value ? "border-accent/50 bg-accent-tint/40" : "border-border hover:border-border-strong",
                          )}
                        >
                          <span className="block text-sm font-medium">{label}</span>
                          <span className="block text-xs text-muted">{desc}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </Field>
                <Field label="Short description" className="sm:col-span-2" error={errors.shortDescription}>
                  {(fid, d) => <Textarea id={fid} aria-describedby={d} value={form.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} className="min-h-[60px]" placeholder="One line shown near the price." />}
                </Field>
                <Field label="Description" className="sm:col-span-2" error={errors.description}>
                  {(fid, d) => <Textarea id={fid} aria-describedby={d} value={form.description} onChange={(e) => set("description", e.target.value)} className="min-h-[120px]" placeholder="Materials, fit, care instructions…" />}
                </Field>
              </div>
            </Panel>

            <Panel title="Media">
              <div className="flex items-start gap-4">
                <Thumb src={form.imageUrl.trim() || null} size="lg" />
                <Field label="Image URL" error={errors.imageUrl} hint="WooCommerce downloads it on sync. If it can't, the product still syncs without it." className="flex-1">
                  {(fid, d) => <Input id={fid} aria-describedby={d} value={form.imageUrl} error={errors.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://picsum.photos/seed/tee/800/800" />}
                </Field>
              </div>
            </Panel>

            {form.type === "simple" ? (
              <Panel title="Pricing & inventory">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field label="Regular price" error={errors.regularPrice}>
                    {(fid, d) => <Input id={fid} aria-describedby={d} prefix="₹" mono inputMode="decimal" value={form.regularPrice} error={errors.regularPrice} onChange={(e) => set("regularPrice", e.target.value)} placeholder="0.00" />}
                  </Field>
                  <Field label="Sale price" error={errors.salePrice} hint="Optional. Lower than regular.">
                    {(fid, d) => <Input id={fid} aria-describedby={d} prefix="₹" mono inputMode="decimal" value={form.salePrice} error={errors.salePrice} onChange={(e) => set("salePrice", e.target.value)} placeholder="—" />}
                  </Field>
                  <Field label="Stock" error={errors.stockQuantity}>
                    {(fid, d) => <Input id={fid} aria-describedby={d} mono inputMode="numeric" value={form.stockQuantity} error={errors.stockQuantity} onChange={(e) => set("stockQuantity", e.target.value)} />}
                  </Field>
                </div>
              </Panel>
            ) : (
              <>
                <Panel title="Default price">
                  <Field
                    label="Price for new variations"
                    error={errors.regularPrice}
                    hint="Each variation can have its own price; this pre-fills new ones."
                    className="max-w-xs"
                  >
                    {(fid, d) => <Input id={fid} aria-describedby={d} prefix="₹" mono inputMode="decimal" value={form.regularPrice} error={errors.regularPrice} onChange={(e) => set("regularPrice", e.target.value)} placeholder="0.00" />}
                  </Field>
                </Panel>

                <Panel title="Attributes">
                  <AttributeEditor
                    attributes={form.attributes}
                    onChange={(a) => set("attributes", a)}
                    attributeSetId={form.attributeSetId}
                    onAttributeSetChange={(sid) => set("attributeSetId", sid)}
                    sets={sets.data ?? []}
                    errors={errors}
                  />
                </Panel>

                <Panel
                  title={
                    <span className="flex items-center gap-2">
                      Variations
                      {p && p.variations.length > 0 && <span className="num rounded bg-subtle px-1.5 text-2xs text-muted">{p.variations.length}</span>}
                    </span>
                  }
                  aside={
                    p && (
                      <Button
                        size="sm"
                        icon={<Sparkles className="h-3.5 w-3.5" />}
                        loading={generate.isPending}
                        disabled={dirty || form.attributes.length === 0 || combos === 0 || combos > MAX_VARIATIONS}
                        title={dirty ? "Save your changes first" : undefined}
                        onClick={() =>
                          generate.mutate(undefined, {
                            onSuccess: (r) =>
                              toast.success("Variations updated", {
                                description: [`${r.created} added`, `${r.kept} kept`, r.removed ? `${r.removed} removed` : ""].filter(Boolean).join(" · "),
                              }),
                            onError: (e) => toast.error("Couldn't generate variations", { description: errorMessage(e) }),
                          })
                        }
                      >
                        {p.variations.length ? "Regenerate" : "Generate"}
                      </Button>
                    )
                  }
                  bodyClassName={p && p.variations.length ? "p-0" : undefined}
                >
                  {isNew ? (
                    <p className="text-sm text-muted">Create the product first, then generate a variation for every combination of attribute options.</p>
                  ) : p && p.variations.length === 0 ? (
                    <p className="text-sm text-muted">
                      {dirty ? "Save your attribute changes, then generate variations." : `Generate ${pluralize(combos, "variation")} from the attributes above.`}
                    </p>
                  ) : p ? (
                    <div>
                      {(!p.variationsUpToDate || dirty) && (
                        <div className="flex items-center gap-2 border-b border-warn/20 bg-warn-tint px-4 py-2.5 text-sm text-warn">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          {dirty
                            ? "Save to apply attribute changes, then regenerate. Existing prices and stock are kept."
                            : "Attributes changed since these were generated. Regenerate before syncing; existing prices and stock are kept."}
                        </div>
                      )}
                      <div className="p-3">
                        <VariationGrid variations={p.variations} attributeNames={attributeNames} />
                        <p className="mt-2 text-xs text-muted">
                          Edits save as you leave a cell. <Kbd>↑</Kbd> <Kbd>↓</Kbd> move between rows, <Kbd>Esc</Kbd> reverts.
                        </p>
                      </div>
                    </div>
                  ) : null}
                </Panel>
              </>
            )}
          </div>

          {/* Right rail */}
          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <SyncPanel product={p ?? null} dirty={dirty} isNew={isNew} syncing={sync.isPending} onSync={runSync} canSync={canSync} />
            {p && (
              <Panel title="Details" bodyClassName="space-y-2.5 text-xs">
                <Meta label="Created" value={relativeTime(p.createdAt)} title={exactTime(p.createdAt)} />
                <Meta label="Updated" value={relativeTime(p.updatedAt)} title={exactTime(p.updatedAt)} />
                <Meta label="PIM ID" value={`#${p.id}`} mono />
                <Meta label="Store ID" value={p.wooId ? `#${p.wooId}` : "—"} mono />
              </Panel>
            )}
            {p && (
              <Button variant="ghost" className="w-full justify-center text-bad hover:bg-bad-tint hover:text-bad" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setDeleting(true)}>
                Delete product
              </Button>
            )}
          </aside>
        </div>
      )}

      <Dialog
        open={!!confirmSimple}
        onClose={() => setConfirmSimple(null)}
        title="Switch to a simple product?"
        description={confirmSimple}
        footer={
          <>
            <Button onClick={() => setConfirmSimple(null)}>Keep variable</Button>
            <Button variant="danger" loading={update.isPending} onClick={() => save(true)}>
              Delete variations & switch
            </Button>
          </>
        }
      />

      <Dialog
        open={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        title="Discard unsaved changes?"
        description="You have edits on this product that haven't been saved."
        footer={
          <>
            <Button onClick={() => blocker.reset?.()}>Keep editing</Button>
            <Button variant="danger" onClick={() => blocker.proceed?.()}>
              Discard
            </Button>
          </>
        }
      />

      <DeleteProductDialog
        product={deleting && p ? p : null}
        onClose={() => setDeleting(false)}
        onDeleted={() => {
          skipGuard.current = true;
          navigate("/products", { replace: true });
        }}
      />
    </>
  );
};

const SyncPanel = ({
  product: p,
  dirty,
  isNew,
  syncing,
  canSync,
  onSync,
}: {
  product: ProductDetail | null;
  dirty: boolean;
  isNew: boolean;
  syncing: boolean;
  canSync: boolean;
  onSync: () => void;
}) => {
  if (isNew || !p) {
    return (
      <Panel title="WooCommerce">
        <p className="text-sm text-muted">Create the product to sync it to your store.</p>
      </Panel>
    );
  }
  const status = syncing ? "syncing" : p.syncStatus;
  const blockedByVariations = p.type === "variable" && (p.variations.length === 0 || !p.variationsUpToDate);
  return (
    <Panel title="WooCommerce" aside={<StatusBadge status={status} />}>
      <div className="space-y-3" aria-live="polite">
        <p className="text-sm text-muted">
          {status === "syncing"
            ? "Pushing to your store…"
            : p.lastSyncedAt
              ? <>Last synced <span className="text-fg" title={exactTime(p.lastSyncedAt)}>{relativeTime(p.lastSyncedAt)}</span></>
              : "Not in the store yet."}
        </p>

        {p.syncStatus === "failed" && p.lastError && !syncing && (
          <div className="rounded border border-bad/25 bg-bad-tint p-2.5">
            <p className="text-2xs font-medium uppercase tracking-wider text-bad">Last error</p>
            <p className="mt-1 break-words text-xs leading-relaxed text-fg/80">{p.lastError}</p>
          </div>
        )}

        <Button
          variant={p.syncStatus === "synced" ? "secondary" : "primary"}
          className="w-full justify-center"
          disabled={!canSync || blockedByVariations}
          onClick={onSync}
          icon={status === "syncing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        >
          {status === "syncing" ? "Syncing…" : p.syncStatus === "failed" ? "Retry sync" : "Sync now"}
          {!dirty && status !== "syncing" && <Kbd className="ml-1 opacity-70">S</Kbd>}
        </Button>
        {dirty && <p className="text-xs text-muted">Save your changes before syncing.</p>}
        {!dirty && blockedByVariations && <p className="text-xs text-muted">{p.variations.length === 0 ? "Generate variations before syncing." : "Regenerate variations before syncing."}</p>}

        {p.storeUrl && (
          <a href={p.storeUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-medium text-accent hover:underline">
            View in store <ArrowUpRight className="h-3 w-3" />
          </a>
        )}
      </div>
    </Panel>
  );
};

const Meta = ({ label, value, title, mono }: { label: string; value: string; title?: string; mono?: boolean }) => (
  <div className="flex justify-between gap-3">
    <span className="text-muted">{label}</span>
    <span className={cn("text-fg", mono && "font-mono")} title={title}>
      {value}
    </span>
  </div>
);

const EditorSkeleton = () => (
  <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_300px]">
    <div className="space-y-5">
      {["h-56", "h-24", "h-32"].map((h) => (
        <div key={h} className="rounded-lg border border-border bg-surface p-4">
          <Skeleton className="mb-4 h-3.5 w-24" />
          <Skeleton className={cn("w-full", h)} />
        </div>
      ))}
    </div>
    <div className="rounded-lg border border-border bg-surface p-4">
      <Skeleton className="mb-4 h-3.5 w-28" />
      <Skeleton className="h-8 w-full" />
    </div>
  </div>
);

