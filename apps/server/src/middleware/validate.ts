import type { Request } from "express";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { AppError } from "../lib/errors";

/** Flattens Zod issues into { "path.to.field": "first message" } for inline form errors. */
export const toFieldErrors = (error: ZodError): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_";
    if (issue.code === "unrecognized_keys") {
      for (const k of issue.keys) out[k] ??= "Unknown field";
      continue;
    }
    out[key] ??= issue.message;
  }
  return out;
};

const parse = <S extends ZodTypeAny>(schema: S, value: unknown, where: string): z.output<S> => {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const fieldErrors = toFieldErrors(result.error);
  const first = Object.entries(fieldErrors)[0];
  const message = first ? (first[0] === "_" ? first[1] : `${first[0]}: ${first[1]}`) : `Invalid ${where}`;
  throw new AppError("VALIDATION_ERROR", 400, message, { fieldErrors });
};

/** Typed request parsing. Throws a 400 with field errors on failure. */
export const parseBody = <S extends ZodTypeAny>(schema: S, req: Request) => parse(schema, req.body ?? {}, "body");
export const parseQuery = <S extends ZodTypeAny>(schema: S, req: Request) => parse(schema, req.query, "query");
export const parseParams = <S extends ZodTypeAny>(schema: S, req: Request) => parse(schema, req.params, "params");
