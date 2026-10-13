import { MAX_ATTRIBUTES, attributeSetCreateSchema, type AttributeSet } from "@pim/shared";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Tags, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { EmptyState, ErrorBanner, Skeleton } from "@/components/ui/Misc";
import { Dialog, Sheet } from "@/components/ui/Overlay";
import { useAttributeSets, useDeleteAttributeSet, useSaveAttributeSet } from "@/hooks/useAttributeSets";
import { ApiError, errorMessage } from "@/lib/api";
import { toFieldErrors } from "@/lib/fieldErrors";
import { pluralize, relativeTime } from "@/lib/format";
import { OptionsInput } from "@/features/products/AttributeEditor";

type Draft = { id?: number; name: string; attributes: { name: string; defaultOptions: string[] }[] };

export const AttributeSetsPage = () => {
  const sets = useAttributeSets();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toDelete, setToDelete] = useState<AttributeSet | null>(null);
  const del = useDeleteAttributeSet();

  const startNew = () => setDraft({ name: "", attributes: [{ name: "", defaultOptions: [] }] });

  return (
    <>
      <PageHeader crumbs={[{ label: "Attribute sets" }]} actions={<Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={startNew}>New set</Button>} />
      <div className="mx-auto w-full max-w-[1000px] space-y-4 p-6">
        <p className="max-w-2xl text-sm text-muted">
          Reusable attribute templates. Picking a set on a variable product fills in its attributes and default options, so every T-shirt gets the same sizes in the same order.
        </p>

        {sets.isError && <ErrorBanner title="Couldn't load attribute sets" message={errorMessage(sets.error)} action={<Button size="sm" onClick={() => sets.refetch()}>Retry</Button>} />}

        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {sets.isLoading ? (
            <div className="space-y-3 p-4">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !sets.data?.length ? (
            <EmptyState icon={<Tags className="h-6 w-6" />} title="No attribute sets yet" description="Create one for each kind of product you sell, like Clothing (Size, Color)." action={<Button variant="primary" onClick={startNew}>New set</Button>} />
          ) : (
            <ul className="divide-y divide-border">
              {sets.data.map((s) => (
                <li key={s.id} className="group flex items-center gap-4 px-4 py-3 hover:bg-subtle/50">
                  <button className="min-w-0 flex-1 text-left" onClick={() => setDraft({ id: s.id, name: s.name, attributes: s.attributes.map((a) => ({ ...a, defaultOptions: [...a.defaultOptions] })) })}>
                    <p className="text-sm font-medium">{s.name}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      {s.attributes.map((a) => (
                        <span key={a.name} className="text-xs text-muted">
                          <span className="text-fg">{a.name}</span>
                          {a.defaultOptions.length > 0 && ` · ${a.defaultOptions.slice(0, 5).join(", ")}${a.defaultOptions.length > 5 ? ` +${a.defaultOptions.length - 5}` : ""}`}
                        </span>
                      ))}
                    </div>
                  </button>
                  <span className="text-xs text-muted">{pluralize(s.productCount, "product")}</span>
                  <span className="hidden w-20 text-right text-xs text-faint sm:block">{relativeTime(s.updatedAt)}</span>
                  <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Delete ${s.name}`} onClick={() => setToDelete(s)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {draft && <SetEditor draft={draft} onClose={() => setDraft(null)} />}

      <Dialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title={`Delete “${toDelete?.name}”?`}
        description={toDelete?.productCount ? `${pluralize(toDelete.productCount, "product")} use this set. They keep their attributes; they just won't be linked to the set anymore.` : "No products use this set."}
        footer={
          <>
            <Button onClick={() => setToDelete(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={del.isPending}
              onClick={() =>
                toDelete &&
                del.mutate(toDelete.id, {
                  onSuccess: () => { toast.success(`Deleted ${toDelete.name}`); setToDelete(null); },
                  onError: (e) => toast.error("Couldn't delete", { description: errorMessage(e) }),
                })
              }
            >
              Delete
            </Button>
          </>
        }
      />
    </>
  );
};

const SetEditor = ({ draft, onClose }: { draft: Draft; onClose: () => void }) => {
  const [d, setD] = useState(draft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSaveAttributeSet();

  const setAttr = (i: number, patch: Partial<Draft["attributes"][number]>) =>
    setD((x) => ({ ...x, attributes: x.attributes.map((a, idx) => (idx === i ? { ...a, ...patch } : a)) }));

  const submit = () => {
    const body = { name: d.name, attributes: d.attributes };
    const check = attributeSetCreateSchema.safeParse(body);
    if (!check.success) return setErrors(toFieldErrors(check.error));
    setErrors({});
    save.mutate(
      { id: d.id, body },
      {
        onSuccess: (s) => { toast.success(d.id ? `Saved ${s.name}` : `Created ${s.name}`); onClose(); },
        onError: (e) => {
          if (e instanceof ApiError) setErrors(e.fieldErrors);
          toast.error("Couldn't save", { description: errorMessage(e) });
        },
      },
    );
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={d.id ? `Edit ${draft.name}` : "New attribute set"}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={submit}>{d.id ? "Save" : "Create set"}</Button></>}
    >
      <div className="space-y-5">
        <Field label="Name" error={errors.name}>
          {(fid, desc) => <Input id={fid} aria-describedby={desc} value={d.name} error={errors.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Clothing" />}
        </Field>
        <div className="space-y-2">
          <p className="text-xs font-medium">Attributes</p>
          {d.attributes.map((a, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex gap-2">
                <Input value={a.name} error={errors[`attributes.${i}.name`]} onChange={(e) => setAttr(i, { name: e.target.value })} placeholder="Attribute name, e.g. Size" aria-label={`Attribute ${i + 1} name`} />
                <Button size="icon" variant="ghost" aria-label="Remove attribute" disabled={d.attributes.length === 1} onClick={() => setD({ ...d, attributes: d.attributes.filter((_, idx) => idx !== i) })}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <OptionsInput options={a.defaultOptions} onChange={(o) => setAttr(i, { defaultOptions: o })} label={a.name || "Attribute"} invalid={!!errors[`attributes.${i}.defaultOptions`]} />
              {(errors[`attributes.${i}.name`] || errors[`attributes.${i}.defaultOptions`]) && (
                <p className="text-xs text-bad">{errors[`attributes.${i}.name`] ?? errors[`attributes.${i}.defaultOptions`]}</p>
              )}
            </div>
          ))}
          {errors.attributes && <p className="text-xs text-bad">{errors.attributes}</p>}
          {d.attributes.length < MAX_ATTRIBUTES && (
            <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setD({ ...d, attributes: [...d.attributes, { name: "", defaultOptions: [] }] })}>
              Add attribute
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
};
