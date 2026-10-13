import { formatInr } from "@pim/shared";

export { formatInr };

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "3m ago", "yesterday", "12 Oct" */
export const relativeTime = (iso: string | null | undefined): string => {
  if (!iso) return "Never";
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), "day");
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

/** "13 Oct 2026, 3:41:07 pm" for tooltips. */
export const exactTime = (iso: string | null | undefined): string =>
  iso
    ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" })
    : "";

/** Paise → editable rupee string: 49900 → "499", 49950 → "499.50" */
export const paiseToInput = (paise: number | null | undefined): string => {
  if (paise === null || paise === undefined) return "";
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
};

/** Rupee input → paise. Empty → null, invalid → NaN (so validation can flag it). */
export const inputToPaise = (value: string): number | null => {
  const t = value.trim().replace(/,/g, "");
  if (t === "") return null;
  if (!/^\d+(\.\d{0,2})?$/.test(t)) return Number.NaN;
  const [whole = "0", frac = ""] = t.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
};

export const pluralize = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
