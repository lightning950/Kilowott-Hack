import { MAX_ATTRIBUTES, MAX_OPTIONS_PER_ATTRIBUTE, MAX_VARIATIONS, type AttributeDef, type AttributeSet } from "@pim/shared";
import { useState, type KeyboardEvent } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { cn } from "@/lib/cn";

interface Props {
  attributes: AttributeDef[];
  onChange: (next: AttributeDef[]) => void;
  attributeSetId: number | null;
  onAttributeSetChange: (id: number | null) => void;
  sets: AttributeSet[];
  errors: Record<string, string>;
}

/** Editable attribute list: name + tag-style options. Picking a set fills in its defaults. */
export const AttributeEditor = ({ attributes, onChange, attributeSetId, onAttributeSetChange, sets, errors }: Props) => {
  const combos = attributes.length ? attributes.reduce((n, a) => n * Math.max(a.options.length, 0), 1) : 0;

  const applySet = (id: number | null) => {
    onAttributeSetChange(id);
    const set = sets.find((s) => s.id === id);
    if (set) onChange(set.attributes.map((a) => ({ name: a.name, options: [...a.defaultOptions] })));
  };

  const patch = (i: number, next: Partial<AttributeDef>) =>
    onChange(attributes.map((a, idx) => (idx === i ? { ...a, ...next } : a)));

  const listError = errors.attributes;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <label className="flex w-64 flex-col gap-1.5">
          <span className="text-xs font-medium">Attribute set</span>
          <Select value={attributeSetId ?? ""} onChange={(e) => applySet(e.target.value ? Number(e.target.value) : null)}>
            <option value="">None — define manually</option>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </label>
        <p className={cn("num pb-2 text-xs", combos > MAX_VARIATIONS ? "font-medium text-bad" : "text-muted")}>
          {combos} {combos === 1 ? "combination" : "combinations"}
          {combos > MAX_VARIATIONS && ` · max ${MAX_VARIATIONS}`}
        </p>
      </div>

      {attributes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center">
          <p className="text-sm text-muted">Variable products need at least one attribute, like Size or Color.</p>
          <Button size="sm" className="mt-3" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => onChange([{ name: "", options: [] }])}>
            Add attribute
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {attributes.map((attr, i) => (
            <div key={i} className="grid grid-cols-[160px_1fr_auto] items-start gap-3 p-3">
              <div>
                <Input
                  value={attr.name}
                  onChange={(e) => patch(i, { name: e.target.value })}
                  placeholder="Name, e.g. Size"
                  aria-label={`Attribute ${i + 1} name`}
                  error={errors[`attributes.${i}.name`]}
                />
                {errors[`attributes.${i}.name`] && <p className="mt-1 text-xs text-bad">{errors[`attributes.${i}.name`]}</p>}
              </div>
              <div>
                <OptionsInput
                  options={attr.options}
                  onChange={(options) => patch(i, { options })}
                  label={attr.name || `Attribute ${i + 1}`}
                  invalid={!!errors[`attributes.${i}.options`]}
                />
                {errors[`attributes.${i}.options`] && <p className="mt-1 text-xs text-bad">{errors[`attributes.${i}.options`]}</p>}
              </div>
              <Button size="icon" variant="ghost" aria-label={`Remove ${attr.name || "attribute"}`} onClick={() => onChange(attributes.filter((_, idx) => idx !== i))}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {listError && <p className="text-xs text-bad">{listError}</p>}

      {attributes.length > 0 && attributes.length < MAX_ATTRIBUTES && (
        <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => onChange([...attributes, { name: "", options: [] }])}>
          Add attribute
        </Button>
      )}
    </div>
  );
};

/** Tag input: Enter or comma adds, Backspace on empty removes the last one. Duplicates are ignored. */
export const OptionsInput = ({ options, onChange, label, invalid }: { options: string[]; onChange: (o: string[]) => void; label: string; invalid: boolean }) => {
  const [draft, setDraft] = useState("");

  const commit = (raw: string) => {
    const values = raw.split(",").map((v) => v.trim()).filter(Boolean);
    if (!values.length) return;
    const next = [...options];
    for (const v of values) {
      if (next.length >= MAX_OPTIONS_PER_ATTRIBUTE) break;
      if (!next.some((o) => o.toLowerCase() === v.toLowerCase())) next.push(v);
    }
    onChange(next);
    setDraft("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && !draft && options.length) {
      onChange(options.slice(0, -1));
    }
  };

  return (
    <div
      className={cn(
        "flex min-h-8 flex-wrap items-center gap-1 rounded border bg-surface px-1.5 py-1 focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/15",
        invalid ? "border-bad/60" : "border-border",
      )}
    >
      {options.map((o) => (
        <span key={o} className="inline-flex h-6 items-center gap-1 rounded border border-border bg-subtle pl-2 pr-1 text-xs">
          {o}
          <button
            onClick={() => onChange(options.filter((x) => x !== o))}
            className="rounded p-0.5 text-faint hover:bg-border hover:text-fg"
            aria-label={`Remove ${o}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => (e.target.value.includes(",") ? commit(e.target.value) : setDraft(e.target.value))}
        onKeyDown={onKey}
        onBlur={() => commit(draft)}
        placeholder={options.length ? "" : "Type an option, press Enter"}
        aria-label={`${label} options`}
        className="h-6 min-w-[120px] flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-faint focus-visible:ring-0"
      />
    </div>
  );
};
