import type { ZodError } from "zod";

/** Same shape the API returns: { "path.to.field": "first message" }. */
export const toFieldErrors = (error: ZodError): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_";
    out[key] ??= issue.message === "Expected number, received nan" ? "Enter a valid number" : issue.message;
  }
  return out;
};
