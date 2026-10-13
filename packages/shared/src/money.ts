/**
 * Money helpers shared by server and web. Amounts are integer paise everywhere
 * except at the WooCommerce boundary, which expects decimal strings like "499.00".
 */

/** 49900 → "499.00" */
export const paiseToDecimal = (paise: number): string => {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(Math.round(paise));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
};

/** "499", "499.5", "499.50" → 49950. Empty or invalid → null. */
export const decimalToPaise = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(/,/g, "");
  if (text === "" || !/^-?\d+(\.\d+)?$/.test(text)) return null;
  const [whole = "0", frac = ""] = text.replace("-", "").split(".");
  const paise = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return text.startsWith("-") ? -paise : paise;
};

/** 49900 → "₹499.00" (en-IN grouping: ₹1,24,999.00) */
export const formatInr = (paise: number): string =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(
    paise / 100,
  );
